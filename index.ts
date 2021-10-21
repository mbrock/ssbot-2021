import { Cheerio, CheerioAPI, load } from "cheerio"
import got from "got"
import * as stream from "stream"
import * as fs from "fs"
import { promisify } from "util"
import * as path from "path"

// import * as imagemin from "imagemin"
// import * as imageminGifsicle from "imagemin-gifsicle"

import * as firebaseAdmin from "firebase-admin"

const serviceAccount = require("./firebase-secret.json")

firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
  databaseURL: "https://ssbot2021.firebaseio.com"
})

const db = firebaseAdmin.firestore()

const pipeline = promisify(stream.pipeline)

async function get(url: string): Promise<CheerioAPI> {
  const response = await got(url)
  return load(response.body)
}

const scrapeTargets = [
  "https://www.ss.com/lv/real-estate/flats/riga/centre/hand_over",
  "https://www.ss.com/lv/real-estate/flats/kuldiga-and-reg/kuldiga/hand_over"
]

async function getProductLinks(url: string) {
  const $ = await get(url)

  const links = $(".msga2 a").toArray().map(a => $(a).attr("href"))

  return links
}

function objectFromKeyValuePairs(pairs: string[][]) {
  const obj = {}
  for (const [key, value] of pairs) {
    obj[key] = value
  }
  return obj
}

async function parseProduct(suffix: string) {
  const url = `https://www.ss.com${suffix}`
  const $ = await get(url)

  const imgurls =
    $(".pic_dv_thumbnail a").map((i, a) => $(a).attr("href")).get()

  const table =
    $(".ads_opt_name").toArray().map(a => [
      $(a).text().replace(":", ""),
      $(a).next().text().replace(" [Karte]", "")
    ])

  const data = {
    url,
    imgurls,
    table: objectFromKeyValuePairs(table),
    price: $(".ads_price").text(),
    coords: mapLinkCoords($("#mnu_map").attr("onclick"))
  }

  return data
}

async function makeTemporaryDirectory(name: string) {
  return await fs.promises.mkdtemp(name)
}

async function download(tmpdir: string, url: string) {
  const dst = path.join(tmpdir, path.basename(url))
  console.log(`Downloading ${url} to ${dst}`)
  await pipeline(
    got.stream(url),
    fs.createWriteStream(dst)
  )

  return dst
}

// async function generateGifFromFrames(paths: string[]) {
//   const gif = await imagemin(paths, {
//     plugins: [imageminGifsicle({
//       optimizationLevel: 2,
//       colors: 64,
//     })]
//   })
//   return gif
// }

async function main() {
  for (const url of scrapeTargets) {
    console.log(`Scraping ${url}`)

    const batch = db.batch()

    const links = await getProductLinks(url)

    for (const link of links) {
      const data = await parseProduct(link)
      console.log(link, data)

      batch.set(db.collection("items").doc(link), data)
    }

    console.log("Committing")

    await batch.commit()
  }
}

main()

function mapLinkCoords(url: String) {
  if (!url) return null

  const x = url.match(/c=(.*?), +(.*?),/)
  if (x) {
    return x.slice(1, 3)
  } else {
    console.log("no match", url)
    return null
  }
}
