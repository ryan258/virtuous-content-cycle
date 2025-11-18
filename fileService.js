const fs = require('fs-extra');
const path = require('path');

const resultsDir = path.join(__dirname, './results');

const saveIterationState = async (contentId, cycle, data) => {
  const dir = path.join(resultsDir, contentId);
  await fs.ensureDir(dir);
  const filePath = path.join(dir, `cycle-${cycle}.json`);
  await fs.writeJson(filePath, data, { spaces: 2 });
  return filePath;
};

const getIterationState = async (contentId, cycle) => {
  const filePath = path.join(resultsDir, contentId, `cycle-${cycle}.json`);
  return await fs.readJson(filePath);
};

const getLatestCycle = async (contentId) => {
  const dir = path.join(resultsDir, contentId);
  const files = await fs.readdir(dir);
  const cycleNumbers = files.map(file => {
    const match = file.match(/cycle-(\d+)\.json/);
    return match ? parseInt(match[1], 10) : 0;
  });
  return Math.max(...cycleNumbers);
};

const getAllCycles = async (contentId) => {
  const dir = path.join(resultsDir, contentId);
  const files = await fs.readdir(dir);
  const cycles = await Promise.all(files.map(async file => {
    const filePath = path.join(dir, file);
    return await fs.readJson(filePath);
  }));
  return cycles.sort((a, b) => a.cycle - b.cycle);
};


module.exports = {
  saveIterationState,
  getIterationState,
  getLatestCycle,
  getAllCycles,
};
