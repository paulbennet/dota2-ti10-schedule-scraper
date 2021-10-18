#!/usr/bin/env node

const puppeteer = require('puppeteer')
const fse = require('fs-extra')
const path = require('path')
const { program } = require('commander')
const ical = require('ical-generator')
const { addHours } = require('date-fns')

let browserPage = null
let browser = null

const scheduleTimezone = 'Europe/Bucharest'

const schedulesURL = 'https://www.dota2.com/esports/ti10/schedule'
const groupStandingsURL = {
  'group-a': 'https://www.dota2.com/esports/ti10/standings/groupa/0',
  'group-b': 'https://www.dota2.com/esports/ti10/standings/groupb/0'
}
// const playoffsURL = 'https://www.dota2.com/esports/ti10/standings/playoff/0'

const getBrowserPage = async () => {
  if (browserPage) {
    return browserPage
  }

  browser = await puppeteer.launch({
    // DEBUG: For visually debugging the browser
    // headless: false,
    // devtools: true,
    // Page content should take full viewport of browser
    defaultViewport: null
  })

  // Using the default opened page itself
  // const pages = await browser.pages()
  // const page = pages[0]

  const context = await browser.createIncognitoBrowserContext()
  const page = await context.newPage()

  // DEBUG: Setting UA to latest chrome
  // page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36')

  page.setExtraHTTPHeaders({
    'X-PUPPETEER-ID': 'dota2-ti10-schedule-scraper'
  })

  await page.setGeolocation({
    latitude: 44.439663,
    longitude: 26.096306
  })

  await page.emulateTimezone(scheduleTimezone)

  // NOTE: Fetch matches from schedules page
  await page.goto(schedulesURL, {
    waitUntil: 'networkidle2',
    // Hopefully page should load before 20 secs
    timeout: 20000
  })

  await page.waitForTimeout(2000)

  await page.evaluate(() => {
    localStorage.setItem('bSpoilerBlockEnabled', '0')
    localStorage.setItem('spoilerBlockCheckTimestamp', Date.now())
  })

  browserPage = page
  return browserPage
}

const fetchSchedulesData = async () => {
  const page = await getBrowserPage()

  await page.setGeolocation({
    latitude: 44.439663,
    longitude: 26.096306
  })

  await page.emulateTimezone(scheduleTimezone)

  // NOTE: Fetch matches from schedules page
  await page.goto(schedulesURL, {
    waitUntil: 'networkidle2',
    // Hopefully page should load before 20 secs
    timeout: 20000
  })

  await page.waitForTimeout(2000)

  await page.evaluate(() => {
    localStorage.setItem('bSpoilerBlockEnabled', '0')
    localStorage.setItem('spoilerBlockCheckTimestamp', Date.now())
  })

  // NOTE: Fetch matches from schedules page
  await page.goto(schedulesURL, {
    waitUntil: 'networkidle2',
    // Hopefully page should load before 20 secs
    timeout: 20000
  })

  await page.waitForTimeout(2000)

  let schedulesJSON = null

  schedulesJSON = await page.evaluate(() => {
    return new Promise((resolve, reject) => {
      // const getAbsURL = (relURL = '') => {
      //   return $('<a />').attr('href', relURL)[0].href
      // }

      const sanitizeText = (text = '') => {
        return text.replace(/\n/gmi, '')
      }

      const findElements = (className, targetDOM = document.body) => {
        const elements = targetDOM.querySelectorAll(`[class*=${className}]`)

        return Array.prototype.map.call(elements, (element) => {
          return element
        }
        )
      }

      const $FE = findElements

      const series = []
      const seriesDOMList = $FE('dpcschedulepage_DPCScheduleEntry_')

      for (const seriesDOM of seriesDOMList) {
        let seriesTime = $FE('dpcschedulepage_TimeLabel_', seriesDOM)[0]
        // const timezoneOffset = seriesTime.childNodes[1].nodeValue

        seriesTime = seriesTime.children[0].getAttribute('datetime')

        let seriesTitle = $FE('dpcschedulepage_Lower_', seriesDOM)[0]
        seriesTitle = seriesTitle.textContent.trim()

        const seriesType = seriesTitle.toUpperCase().startsWith('GROUP') ? 'group-stage' : 'main-event'

        const teamNames = $FE('dpcschedulepage_TeamName_', seriesDOM).map((teamNameDOM) => {
          return teamNameDOM.textContent.trim()
        }
        )

        const teamLogos = $FE('dpcschedulepage_TeamLogo_', seriesDOM).map((teamLogoDOM) => {
          return teamLogoDOM.src
        }
        )

        const teamIDs = teamLogos.map((logoURL) => {
          const urlParts = logoURL.split('/')
          const fileName = urlParts[urlParts.length - 1]

          const teamID = fileName.replace('.png', '')

          return teamID === 'team_unknown_web' ? 'tbd' : teamID
        }
        )

        let scores = $FE('dpcschedulepage_Score_', seriesDOM)[0].textContent.trim()

        if (scores === 'vs') {
          scores = [0, 0]
        } else {
          scores = scores.split(' - ')
        }

        const teams = []

        teams.push({
          id: sanitizeText(teamIDs[0]),
          // logo: teamLogos[0],
          name: sanitizeText(teamNames[0]),
          score: sanitizeText(scores[0])
        })

        teams.push({
          id: sanitizeText(teamIDs[1]),
          // logo: teamLogos[1],
          name: sanitizeText(teamNames[1]),
          score: sanitizeText(scores[1])
        })

        seriesTime = new Date(parseInt(seriesTime))

        series.push({
          title: sanitizeText(seriesTitle),
          type: sanitizeText(seriesType),
          time: sanitizeText(seriesTime.toISOString()),
          // timezoneOffset,
          teams
        })
      }

      resolve(series)
    })
  })

  return schedulesJSON
}

const fetchGroupStandings = async (groupID) => {
  const standingsURL = groupStandingsURL[groupID]

  const page = await getBrowserPage()

  // NOTE: Fetch matches from schedules page
  await page.goto(standingsURL, {
    waitUntil: 'networkidle2',
    // Hopefully page should load before 20 secs
    timeout: 20000
  })

  await page.waitForTimeout(2000)

  let standingsJSON = null

  standingsJSON = await page.evaluate(() => {
    return new Promise((resolve, reject) => {
      console.clear()

      const findElements = (className, targetDOM = document.body) => {
        const elements = targetDOM.querySelectorAll(`[class*=${className}]`)

        return Array.prototype.map.call(elements, (element) => {
          return element
        }
        )
      }

      const $FE = findElements

      const standings = {}
      const teamsDOMList = $FE('dpcstandings_DPCStandingsTeam_')

      teamsDOMList.splice(0, 1)

      for (const teamsDOM of teamsDOMList) {
        const teamName = $FE('dpcstandings_TeamName_', teamsDOM)[0].textContent.trim()
        const teamLogo = $FE('dpcstandings_TeamLogo', teamsDOM)[0].src
        let teamID = teamLogo

        const urlParts = teamID.split('/')
        const fileName = urlParts[urlParts.length - 1]
        teamID = fileName.replace('.png', '')
        teamID = teamID === 'team_unknown_web' ? 'tbd' : teamID

        const teamWins = $FE('dpcstandings_Wins_', teamsDOM)[0].textContent.trim()
        const teamLoses = $FE('dpcstandings_Losses_', teamsDOM)[0].textContent.trim()

        standings[teamID] = {
          id: teamID,
          name: teamName,
          // logo: teamLogo,
          wins: teamWins,
          losses: teamLoses
        }
      }

      resolve(standings)
    })
  })

  return standingsJSON
}

const saveScheduleToICal = async ({ schedules = [], outputDir = null }) => {
  const calendar = ical({ name: 'dota2-ti10-schedule' })

  // calendar.timezone(scheduleTimezone)
  calendar.ttl(3600)
  calendar.prodId({
    company: 'dota2-ti10-schedule-scraper',
    product: 'dota2-ti10-schedule-scraper'
  })

  for (const series of schedules) {
    const startTime = new Date(series.time)
    const endTime = addHours(startTime, 1)

    const teamName1 = series.teams[0].id === 'tbd' ? 'TBD' : series.teams[0].name
    const teamName2 = series.teams[1].id === 'tbd' ? 'TBD' : series.teams[1].name

    let title = `${teamName1} vs ${teamName2} - ${series.title}`

    if (series.title.indexOf('Grand Final') !== -1) {
      title = `🏆💥 ${title}`
    } else if (series.title.indexOf('Final') !== -1) {
      title = `🔥 ${title}`
    } else if (series.title.indexOf('Quarterfinal') !== -1) {
      title = `⭐ ${title}`
    } else if (series.title.indexOf('Semifinal') !== -1) {
      title = `🌟 ${title}`
    } else if (series.type === 'main-event') {
      title = `✨ ${title}`
    }

    calendar.createEvent({
      // timezone: scheduleTimezone,
      start: startTime.toISOString(),
      end: endTime.toISOString(),
      summary: title
      // x: [{
      //   key: 'X-CONTESTANTS',
      //   value: JSON.stringify(series.teams)
      // }]
    })
  }

  calendar.saveSync(path.join(outputDir, 'dota2-ti10-schedule.ical'))
}

const mainProcess = async () => {
  program.option('-o --output-dir <output-dir>', 'Output directory path')

  program.parse(process.argv)

  let {
    outputDir
  } = program.opts()

  if (!outputDir) {
    console.error('Requires output-dir param')
    return
  }

  if (outputDir.startsWith('~/')) {
    outputDir = path.resolve(
      path.join(
        require('os').homedir(), outputDir.substring(2)
      )
    )
  }

  outputDir = path.resolve(outputDir)
  fse.mkdirpSync(outputDir)

  const schedulesJSON = await fetchSchedulesData()
  const groupStandings = {}

  groupStandings['group-a'] = await fetchGroupStandings('group-a')
  groupStandings['group-b'] = await fetchGroupStandings('group-b')

  const outputJSON = {
    series: schedulesJSON,
    standings: groupStandings
  }

  let outputFilePath = null

  outputFilePath = 'dota2-ti10-schedule.json'

  fse.writeFileSync(path.join(outputDir, outputFilePath),
    JSON.stringify(outputJSON, null, 2))

  await saveScheduleToICal({
    schedules: schedulesJSON,
    outputDir
  })

  // Cleanup
  await browser.close()
  browser = null
  browserPage = null
}

mainProcess()
