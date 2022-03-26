/* Magic Mirror
 * Module: MMM-FF-XKCD
 *
 * By Michael Trenkler
 * ISC Licensed.
 */

const fs = require("fs");

const PersistenceService = function (nodeHelper, config) {
  var { persistence, persistenceId, persistencePath } = config;

  this.init = () => {
    createPersistenceStorageDirectory();
  };

  const getPersistenceStoragePath = () => {
    return [persistencePath, persistenceId]
      .join("/")
      .replace(/\/\//g, "/")
      .replace(/\/$/, "");
  };

  const createPersistenceStorageDirectory = () => {
    if (persistencePath === null) {
      persistencePath = `${nodeHelper.path}/.store`;
    }
    if (persistence === "server") {
      const path = getPersistenceStoragePath();
      if (!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true });
      }
      if (!fs.lstatSync(path).isDirectory()) {
        persistence = false;
      }
    }
  };

  this.readPersistentState = () => {
    if (persistence === "server") {
      const path = getPersistenceStoragePath();
      const filePath = path + "/data";
      if (!fs.existsSync(filePath)) return null;
      const buffer = fs.readFileSync(filePath, { encoding: "utf8", flag: "r" });
      const json = JSON.parse(buffer);
      return json;
    }
    return null;
  };

  this.writePersistentState = (data) => {
    if (persistence === "server") {
      const path = getPersistenceStoragePath();
      const filePath = path + "/data";
      fs.writeFileSync(filePath, JSON.stringify(data), {
        encoding: "utf8",
        flag: "w"
      });
    }
  };
};

module.exports = PersistenceService;
