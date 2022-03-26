/* Magic Mirror
 * Module: MMM-FF-XKCD
 *
 * By Michael Trenkler
 * ISC Licensed.
 */

const https = require("https");
const PersistenceService = require("./persistenceService.js");

const BASE_URL = "https://xkcd.com";
const JSON_INFO = "info.0.json";

const ComicFetcher = function (nodeHelper, config) {
  var {
    moduleId,
    initialComic,
    sequence,
    updateOnSuspension,
    updateInterval,
    persistence
  } = config;

  // public for filtering
  this.moduleId = moduleId;

  var baseData = null; // initially loaded info
  var comic = null;
  var hidden = false;
  var timerObj = null;
  var updateOnVisibilityChangeRequested = false;

  const storage = new PersistenceService(nodeHelper, config);

  const startInterval = () => {
    stopInterval();

    updateOnVisibilityChangeRequested = false;

    if (updateInterval === null) return;
    timerObj = setTimeout(() => intervalCallback(), updateInterval);
  };

  const stopInterval = () => {
    if (!timerObj) return;
    if (timerObj) clearTimeout(timerObj);
    timerObj = null;
  };

  const intervalCallback = () => {
    stopInterval();
    if (!hidden && updateOnSuspension !== true) {
      proceed();
    } else if (hidden && updateOnSuspension === null) {
      proceed();
    } else {
      updateOnVisibilityChangeRequested = true;
    }
  };

  const proceed = () => {
    stopInterval();

    if (!baseData?.count) return;

    switch (sequence) {
      case "random":
        this.getRandomComic();
        break;
      case "reverse":
        this.getPreviousComic();
        break;
      case "latest":
        this.getLatestComic();
        break;
      default:
      case "default":
        this.getNextComic();
        break;
    }
  };

  this.getFirstComic = () => {
    this.getComic(1);
  };

  this.getPreviousComic = () => {
    if (comic.num > 1) {
      this.getComic(comic.num - 1);
    } else {
      this.getLatestComic();
    }
  };

  this.getNextComic = () => {
    if (comic.num < baseData.num) {
      this.getComic(comic.num + 1);
    } else {
      this.getFirstComic();
    }
  };

  this.suspend = () => {
    hidden = true;
    if (!comic) return;
    if (updateOnVisibilityChangeRequested && updateOnSuspension === true) {
      proceed();
    } else if (!timerObj && updateOnSuspension !== true) {
      startInterval();
    }
  };

  this.resume = () => {
    hidden = false;
    if (!comic) return;
    if (updateOnVisibilityChangeRequested && updateOnSuspension === false) {
      proceed();
    } else if (!timerObj) {
      startInterval();
    }
  };

  this.getInitialData = () => {
    if (baseData) return;
    baseData = {};
    storage.init();

    const url = [BASE_URL, JSON_INFO].join("/");
    const request = https
      .get(url, (response) => {
        if (response.statusCode === 200) {
          let data = "";
          response
            .on("data", (body) => {
              data += body;
            })
            .on("end", () => {
              baseData = JSON.parse(data);
              baseData.count = baseData.num;
              nodeHelper.sendSocketNotification("COMIC", baseData);
              this.getInitialComic();
            })
            .on("error", (err) => {
              console.error(err);
              nodeHelper.sendSocketNotification("ERROR", err);
            });
        } else {
          baseData = null;
          nodeHelper.sendSocketNotification("ERROR", response);
        }
      })
      .on("error", (err) => {
        console.error(err);
        baseData = null;
        nodeHelper.sendSocketNotification("ERROR", err);
      });
    request.end();
  };

  this.getInitialComic = () => {
    if (!baseData) return this.getInitialData();

    if (comic) {
      if (comic?.id) updateComic(comic);
      return;
    }

    if (persistence === "server") {
      const data = storage.readPersistentState();
      if (data) {
        const pId = parseInt(data.id, 10);
        if (Number.isInteger(pId)) initialComic = pId;
      }
    }

    comic = {};
    if (Number.isInteger(initialComic)) {
      this.getComic(initialComic);
    } else {
      switch (initialComic) {
        case "first":
          this.getFirstComic();
          break;
        case "random":
          this.getRandomComic();
          break;
        case "latest":
          updateComic(parseData(baseData));
          break;
        default:
          break;
      }
    }
  };

  const prepareNotificationConfig = () => {
    const copy = Object.assign({ comic: comic }, config);
    return copy;
  };

  const updateComic = (comicData) => {
    comic = comicData;
    nodeHelper.sendSocketNotification("UPDATE_COMIC", {
      config: prepareNotificationConfig()
    });
    storage.writePersistentState({ id: comic.num });
    startInterval();
  };

  this.getLatestComic = () => {
    this.getComic();
  };

  this.getRandomComic = () => {
    if (!baseData.count) return;
    const num = Math.floor(Math.random() * baseData.count + 1);
    this.getComic(num);
  };

  const parseData = (body) => {
    const comic = JSON.parse(body);
    return comic;
  };

  this.getComic = (num) => {
    num = Math.max(
      1,
      Math.min(num, baseData?.count ?? Number.MAX_SAFE_INTEGER)
    );

    const url = [BASE_URL, num, JSON_INFO]
      .filter((_) => _) // remove num if null -> results in latest comic
      .join("/");
    const request = https
      .get(url, (response) => {
        if (response.statusCode === 200) {
          let data = "";
          response
            .on("data", (body) => {
              data += body;
            })
            .on("end", () => {
              if (num === null) {
                baseData = JSON.parse(data);
                baseData.count = baseData.num;
              }
              updateComic(parseData(data));
            })
            .on("error", (err) => {
              console.error(err);
              this.sendSocketNotification("ERROR", err);
            });
        } else {
          this.sendSocketNotification("ERROR", response);
        }
      })
      .on("error", (err) => {
        console.error(err);
        this.sendSocketNotification("ERROR", err);
      });

    request.end();
  };
};

module.exports = ComicFetcher;
