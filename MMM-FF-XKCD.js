/* Magic Mirror
 * Module: MMM-FF-XKCD
 *
 * By Michael Trenkler
 * ISC Licensed.
 */

Module.register("MMM-FF-XKCD", {
  defaults: {
    header: "xkcd",
    initialComic: "latest",
    sequence: "random",
    updateOnSuspension: null,
    updateInterval: 1 * 60 * 60 * 1000,
    grayscale: false,
    inverted: true,
    imageMaxWidth: null,
    imageMaxHeight: null,
    showTitle: true,
    showDate: true,
    showAltText: true,
    showNum: true,
    animationSpeed: 1000,
    events: {
      COMIC_FIRST: "COMIC_FIRST",
      COMIC_LATEST: "COMIC_LATEST",
      COMIC_PREVIOUS: "COMIC_PREVIOUS",
      COMIC_NEXT: "COMIC_NEXT",
      COMIC_RANDOM: "COMIC_RANDOM"
    },
    persistence: null,
    persistenceId: null,
    persistencePath: null
  },

  init: function () {
    this.error = null;
    this.comicData = {
      count: 0,
      num: 0,
      title: "",
      img: "",
      alt: "",
      year: null,
      month: null,
      day: null
    };
  },

  start: function () {
    Log.info("Starting module: " + this.name);
    this.config.moduleId = this.identifier;
    if (this.config.persistenceId === null)
      this.config.persistenceId = this.config.moduleId;
    if (this.config.persistence) {
      this.readPersistentState();
    }
    this.sendSocketNotification("GET_INITIAL_COMIC", { config: this.config });
  },

  clientUsesStorage: function () {
    const config = this.config;
    return (
      config.persistence === "client" ||
      (config.persistence === "electron" &&
        window.navigator.userAgent.match(/Electron/i))
    );
  },

  getPersistenceStore: function () {
    const config = this.config;
    return [config.persistenceId, "data"].join("/").replace(/\/\//g, "/");
  },

  readPersistentState: function () {
    if (this.clientUsesStorage()) {
      const path = this.getPersistenceStore();
      const data = window.localStorage.getItem(path);
      if (data) {
        const json = JSON.parse(data);
        const pId = parseInt(json.id);
        if (Number.isInteger(pId)) {
          this.config.initialComic = pId;
        }
      }
    }
  },

  writePersistentState: function () {
    const config = this.config;
    if (this.clientUsesStorage() && this.comicData?.num) {
      const path = this.getPersistenceStore(config);
      const data = JSON.stringify({ id: this.comicData.num });
      window.localStorage.setItem(path, data);
    }
  },

  getScripts: function () {
    return [];
  },

  getStyles: function () {
    return [this.file("./styles/MMM-FF-XKCD.css")];
  },

  getHeader: function () {
    if (!this.config.showTitle || !this.comicData) return null;
    let title = [];
    title.push(
      this.config.header +
        (this.config.showNum && this.comicData.num
          ? " " + this.comicData.num
          : "")
    );
    if (!this.comicData.title === "") title.push(this.comicData.title);
    if (this.config.showDate && this.comicData.year)
      title.push(
        [
          this.comicData.year,
          this.comicData.month.padStart(2, "0"),
          this.comicData.day.padStart(2, "0")
        ].join("-")
      );
    return title.join(" - ");
  },

  getDom: function () {
    var wrapper = document.createElement("div");

    if (this.error) {
      wrapper.innerHTML = "ERROR<br>" + JSON.stringify(this.error);
      wrapper.className = "light small error";
      return wrapper;
    }

    let loaded = this.comicData?.count !== 0;
    if (!loaded) {
      wrapper.innerHTML = this.translate("LOADING");
      wrapper.className = "light small dimmed";
      return wrapper;
    }

    var imgWrapper = document.createElement("div");
    imgWrapper.classList.add("comic-wrapper");

    var img = document.createElement("img");
    img.classList.add("comic");
    img.src = this.comicData.img;
    img.alt = this.comicData.alt;

    img.classList.toggle("grayscale", this.config.grayscale);
    img.classList.toggle("inverted", this.config.inverted);

    img.style.maxWidth = this.config.imageMaxWidth;
    img.style.maxHeight = this.config.imageMaxHeight;

    imgWrapper.appendChild(img);
    wrapper.appendChild(imgWrapper);

    if (this.config.showAltText && this.comicData.alt) {
      var altText = document.createElement("div");
      altText.classList.add("alt-text");
      altText.innerText = this.comicData.alt;
      wrapper.appendChild(altText);
    }

    return wrapper;
  },

  socketNotificationReceived: function (notification, payload) {
    if (!payload.config || payload.config.moduleId !== this.config.moduleId)
      return;
    switch (notification) {
      case "ERROR":
        this.error = payload;
        this.updateDom(this.config.animationSpeed);
        break;
      case "UPDATE_COMIC":
        this.error = null;
        this.comicData = payload.config.comic;
        this.config.comic = this.comicData;
        this.updateDom(this.config.animationSpeed);
        this.writePersistentState();
        break;
      default:
        break;
    }
  },

  isAcceptableSender(sender) {
    if (!sender) return true;
    const acceptableSender = this.config.events.sender;
    return (
      !acceptableSender ||
      acceptableSender === sender.name ||
      acceptableSender === sender.identifier ||
      (Array.isArray(acceptableSender) &&
        (acceptableSender.includes(sender.name) ||
          acceptableSender.includes(sender.identifier)))
    );
  },

  showLoader: function () {
    this.init();
    this.updateDom(this.config.animationSpeed);
  },

  notificationReceived: function (notification, payload, sender) {
    if (!this.isAcceptableSender(sender)) return;

    this.config.events[notification]?.split(" ").each((e) => {
      switch (e) {
        case "COMIC_FIRST":
          if (!this.hidden) {
            this.showLoader();
            this.sendSocketNotification("GET_FIRST_COMIC", {
              config: this.config
            });
          }
          break;
        case "COMIC_LATEST":
          if (!this.hidden) {
            this.showLoader();
            this.sendSocketNotification("GET_LATEST_COMIC", {
              config: this.config
            });
          }
          break;
        case "COMIC_PREVIOUS":
          if (!this.hidden) {
            this.showLoader();
            this.sendSocketNotification("GET_PREVIOUS_COMIC", {
              config: this.config
            });
          }
          break;
        case "COMIC_NEXT":
          if (!this.hidden) {
            this.showLoader();
            this.sendSocketNotification("GET_NEXT_COMIC", {
              config: this.config
            });
          }
          break;
        case "COMIC_RANDOM":
          if (!this.hidden) {
            this.showLoader();
            this.sendSocketNotification("GET_RANDOM_COMIC", {
              config: this.config
            });
          }
          break;
        default:
          break;
      }
    });
  },

  suspend: function () {
    this.suspended = true;
    this.sendSocketNotification("SUSPEND", { config: this.config });
  },

  resume: function () {
    if (this.suspended === false) return;
    this.suspended = false;
    this.sendSocketNotification("RESUME", { config: this.config });
  }
});
