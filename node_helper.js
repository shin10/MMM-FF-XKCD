/* Magic Mirror
 * Module: MMM-FF-XKCD
 *
 * By Michael Trenkler
 * ISC Licensed.
 */

const NodeHelper = require("node_helper");
const ComicFetcher = require("./comicFetcher.js");

module.exports = NodeHelper.create({
  fetcherInstances: [],

  start: function () {
    console.log("Starting node helper: " + this.name);
  },

  getFetcher: function (config) {
    let instance = this.fetcherInstances.filter(
      (instance) => instance.moduleId === config.moduleId
    )[0];
    if (!instance) {
      instance = new ComicFetcher(this, config);
      this.fetcherInstances.push(instance);
    }
    return instance;
  },

  socketNotificationReceived: function (notification, payload) {
    if (!payload.config) return;

    const fetcher = this.getFetcher(payload.config);

    switch (notification) {
      case "GET_INITIAL_COMIC":
        fetcher.getInitialComic();
        break;
      case "GET_FIRST_COMIC":
        fetcher.getFirstComic();
        break;
      case "GET_PREVIOUS_COMIC":
        fetcher.getPreviousComic();
        break;
      case "GET_NEXT_COMIC":
        fetcher.getNextComic();
        break;
      case "GET_LATEST_COMIC":
        fetcher.getLatestComic();
        break;
      case "GET_RANDOM_COMIC":
        fetcher.getRandomComic();
        break;
      case "GET_COMIC":
        fetcher.getComic(payload.num);
        break;
      case "SUSPEND":
        fetcher.suspend();
        break;
      case "RESUME":
        fetcher.resume();
        break;
      default:
        break;
    }
  }
});
