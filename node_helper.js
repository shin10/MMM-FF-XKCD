/* Magic Mirror
 * Module: MMM-Ff-XKCD
 *
 * By Michael Trenkler
 * ISC Licensed.
 */

const NodeHelper = require("node_helper");
const fs = require("fs");
const https = require("https");

module.exports = NodeHelper.create({
  /**
   * The data returned from requesting the latest comic.
   * We keep it to know the total number of comics.
   * If the data is an empty object, the request is in progress.
   */
  comicData: null,

  /**
   * A pool of instance configs with references to their individual
   * timerObjects and comic data.
   */
  instanceData: {},

  start: function () {
    console.log("Starting node helper: " + this.name);
  },

  stopInterval(config) {
    const timerObj = this.instanceData[config.moduleId]?.timerObj;
    if (!timerObj) return;
    if (timerObj) clearTimeout(timerObj);
    this.instanceData[config.moduleId].timerObj = null;
  },

  startInterval: function (config) {
    this.stopInterval(config);

    config.updateOnVisibilityChangeRequested = false;
    if (!this.instanceData[config.moduleId])
      this.instanceData[config.moduleId] = config;
    const instanceConfig = this.instanceData[config.moduleId];

    if (config.updateInterval === null) return;
    instanceConfig.timerObj = setTimeout(
      () => this.intervalCallback(instanceConfig),
      config.updateInterval,
      config
    );
  },

  intervalCallback: function (config) {
    this.stopInterval(config);
    if (!config.hidden && config.updateOnSuspension !== true) {
      this.proceed(config);
    } else if (config.hidden && config.updateOnSuspension === null) {
      this.proceed(config);
    } else {
      config.updateOnVisibilityChangeRequested = true;
    }
  },

  proceed: function (config) {
    this.stopInterval(config);

    if (!this.comicData.count) return;

    switch (config.sequence) {
      case "random":
        this.getRandomComic(config);
        break;
      case "reverse":
        this.getPreviousComic(config);
        break;
      case "latest":
        this.getLatestComic(config);
        break;
      default:
      case "default":
        this.getNextComic(config);
        break;
    }
  },

  getPreviousComic: function (config) {
    if (!this.comicData.count || !config.comic?.num) return;
    var num = config.comic.num - 1;
    if (num <= 0) num = this.comicData.count;
    this.getComic(config, num);
  },

  getNextComic: function (config) {
    if (!this.comicData.count || !config.comic?.num) return;
    var num = config.comic.num + 1;
    if (num > this.comicData.count) num = 1;
    this.getComic(config, num);
  },

  prepareNotificationConfig: function (config) {
    /**
     * Returns a clone of the config and without it's timerObj to avoid circular reference
     * errors when serializing the config.
     */
    const copy = Object.assign({}, config);
    delete copy.timerObj;
    return copy;
  },

  socketNotificationReceived: function (notification, payload) {
    const instanceConfig =
      this.instanceData[payload.config.moduleId] || payload.config;
    switch (notification) {
      case "GET_INITIAL_COMIC":
        this.createPersistenceStorageDirectory(instanceConfig);
        if (!this.comicData) {
          this.getInitialData(instanceConfig);
        } else {
          this.getInitialComic(instanceConfig);
        }
        return;
      case "GET_FIRST_COMIC":
        this.getComic(instanceConfig, 1);
        break;
      case "GET_PREVIOUS_COMIC":
        this.getPreviousComic(instanceConfig);
        break;
      case "GET_NEXT_COMIC":
        this.getNextComic(instanceConfig);
        break;
      case "GET_LATEST_COMIC":
        this.getLatestComic(instanceConfig);
        break;
      case "GET_RANDOM_COMIC":
        this.getRandomComic(instanceConfig);
        break;
      case "GET_COMIC":
        this.getComic(instanceConfig, payload.num);
        break;
      case "SUSPEND":
        instanceConfig.hidden = true;
        if (!instanceConfig.comic) return;
        if (
          instanceConfig.updateOnVisibilityChangeRequested &&
          instanceConfig.updateOnSuspension === true
        ) {
          this.proceed(instanceConfig);
        } else if (
          !instanceConfig.timerObj &&
          instanceConfig.updateOnSuspension !== true
        ) {
          this.startInterval(instanceConfig);
        }
        break;
      case "RESUME":
        instanceConfig.hidden = false;

        if (!instanceConfig.comic) return;
        if (
          instanceConfig.updateOnVisibilityChangeRequested &&
          instanceConfig.updateOnSuspension === false
        ) {
          this.proceed(instanceConfig);
        } else if (!instanceConfig.timerObj) {
          this.startInterval(instanceConfig);
        }
        break;
      default:
        break;
    }
  },

  getInitialData: function (config) {
    if (this.comicData) return;
    this.comicData = {};

    const instanceConfig = this.instanceData[config.moduleId];
    if (instanceConfig) return;

    this.instanceData[config.moduleId] = config;

    const url = "https://xkcd.com/info.0.json";
    const request = https
      .get(url, (response) => {
        if (response.statusCode === 200) {
          let data = "";
          response
            .on("data", (body) => {
              data += body;
            })
            .on("end", () => {
              this.comicData = JSON.parse(data);
              this.comicData.count = this.comicData.num;
              this.sendSocketNotification("COMIC", this.comicData);
              this.getInitialComic(config);
            })
            .on("error", (err) => {
              console.error(err);
              this.sendSocketNotification("ERROR", err);
            });
        } else {
          this.comicData = null;
          this.sendSocketNotification("ERROR", response);
        }
      })
      .on("error", (err) => {
        console.error(err);
        this.comicData = null;
        this.sendSocketNotification("ERROR", err);
      });

    request.end();
  },

  getInitialComic: function (config) {
    if (!this.comicData) return;

    const instanceConfig = this.instanceData[config.moduleId];
    if (instanceConfig.comic?.num) {
      this.sendSocketNotification("UPDATE_COMIC", {
        config: this.prepareNotificationConfig(instanceConfig)
      });
      return;
    }

    if (instanceConfig.comic) return;

    let initialComic = config.initialComic;

    if (config.persistence === "server") {
      const data = this.readPersistentState(config);
      if (data) {
        const pId = parseInt(data.id, 10);
        if (Number.isInteger(pId)) initialComic = pId;
      }
    }

    this.instanceData[config.moduleId].comic = {};
    if (Number.isInteger(initialComic)) {
      this.getComic(config, initialComic);
    } else {
      switch (initialComic) {
        case "latest":
          config.comic = this.comicData;
          this.sendSocketNotification("UPDATE_COMIC", {
            config: this.prepareNotificationConfig(instanceConfig)
          });
          break;
        case "first":
          this.getComic(config, 1);
          break;
        case "random":
          this.getRandomComic(config);
          break;
        default:
          break;
      }
    }
  },

  updateComic: function (config, comic) {
    config.comic = comic;
    const instanceConfig = (this.instanceData[config.moduleId] = config);
    this.sendSocketNotification("UPDATE_COMIC", {
      config: this.prepareNotificationConfig(instanceConfig)
    });
    this.writePersistentState(config, { id: comic.num });
    this.startInterval(config);
  },

  getPersistenceStoragePath: function (config) {
    return [config.persistencePath, config.persistenceId]
      .join("/")
      .replace(/\/\//g, "/")
      .replace(/\/$/, "");
  },

  createPersistenceStorageDirectory: function (config) {
    if (config.persistencePath === null)
      config.persistencePath = `${this.path}/.store`;
    if (config.persistence === "server") {
      const path = this.getPersistenceStoragePath(config);
      if (!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true });
      }
      if (!fs.lstatSync(path).isDirectory()) {
        config.persistence = false;
      }
    }
  },

  readPersistentState: function (config) {
    if (config.persistence === "server") {
      const path = this.getPersistenceStoragePath(config);
      const filePath = path + "/data";
      if (!fs.existsSync(filePath)) return null;
      const buffer = fs.readFileSync(filePath, { encoding: "utf8", flag: "r" });
      const json = JSON.parse(buffer);
      return json;
    }
    return null;
  },

  writePersistentState: function (config, data) {
    if (config.persistence === "server") {
      const path = this.getPersistenceStoragePath(config);
      const filePath = path + "/data";
      fs.writeFileSync(filePath, JSON.stringify(data), {
        encoding: "utf8",
        flag: "w"
      });
    }
  },

  getLatestComic: function (config) {
    if (!this.comicData.count) return;
    this.stopInterval(config);

    const url = "https://xkcd.com/info.0.json";
    const request = https
      .get(url, (response) => {
        if (response.statusCode === 200) {
          let data = "";
          response
            .on("data", (body) => {
              data += body;
            })
            .on("end", () => {
              this.updateComic(config, JSON.parse(data));
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
  },

  getRandomComic: function (config) {
    if (!this.comicData.count) return;
    const num = Math.floor(Math.random() * this.comicData.count + 1);
    this.getComic(config, num);
  },

  getComic: function (config, num) {
    num = Math.max(1, Math.min(num, this.comicData.count));

    const url = "https://xkcd.com/" + num + "/info.0.json";
    const request = https
      .get(url, (response) => {
        if (response.statusCode === 200) {
          let data = "";
          response
            .on("data", (body) => {
              data += body;
            })
            .on("end", () => {
              this.updateComic(config, JSON.parse(data));
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
  }
});
