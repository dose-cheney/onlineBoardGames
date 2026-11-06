const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const gameMath = Object.create(Math);
gameMath.random = () => crypto.randomInt(0x100000000) / 0x100000000;
const context = vm.createContext({ Math: gameMath });
context.window = context;

for (const file of ['core.js', 'athlete-data.js', 'splendor.js', 'scout.js', 'poker.js', 'athlete.js', 'flip7.js', 'mahjong.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), context, { filename: file });
}

module.exports = context.GameCore;
