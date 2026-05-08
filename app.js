const ASSETS = {
  bodyClosed: "./assets/garchomp-body.svg",
  bodyOpen: "./assets/garchomp-mouthopen.svg",
  armIdle: "./assets/garchomp-arm-idle.svg",
  armPulled: "./assets/garchomp-arm-pulled.svg",
  ballClosed: "./assets/pokeball-close.svg",
  ballOpen: "./assets/pokeball-open.svg",
  ballOpenEffect: "./assets/pokeball-open-effect.svg",
  sparkle: "./assets/sparkle.svg",
};

const BALL_END_POINT = {
  x: 1.0449,
  y: 0.8623,
};

const OPEN_BALL_PREVIEW_MS = 560;
const DISPENSE_BALL_MIN_MS = 1180;
const DISPENSE_BALL_FALLBACK_MS = 1400;
const FLASH_EFFECT_WHITE_RADIUS = 50;
const FLASH_EFFECT_MARGIN = 120;

const DATA_SOURCES = {
  sprites: "./assets/sprites/mega-sprites.json",
  pool: "./assets/gacha-pools/regulation-m-a.json",
};

const machine = document.querySelector("#gachaMachine");
const drawButton = document.querySelector("#drawButton");
const leverButton = document.querySelector("#leverButton");
const resultPanel = document.querySelector("#resultPanel");
const resultName = document.querySelector("#resultName");
const resultSprite = document.querySelector("#resultSprite");
const resultText = document.querySelector("#resultText");
const partyList = document.querySelector("#partyList");
const closedBallElement = document.querySelector(".ball-closed");
const openBallElement = document.querySelector(".ball-open");
const screenFlashEffect = document.querySelector("#screenFlashEffect");

let isDrawing = false;
let lastApiName = "";
let gachaPool = [];
let activePoolLabel = "レギュレーションM-A";

function setAssetSources() {
  document.querySelector(".body-closed").src = ASSETS.bodyClosed;
  document.querySelector(".body-open").src = ASSETS.bodyOpen;
  document.querySelector(".arm-idle").src = ASSETS.armIdle;
  document.querySelector(".arm-pulled").src = ASSETS.armPulled;
  closedBallElement.src = ASSETS.ballClosed;
  openBallElement.src = ASSETS.ballOpen;
  screenFlashEffect.src = ASSETS.ballOpenEffect;
  document.querySelectorAll(".sparkle").forEach((sparkle) => {
    sparkle.src = ASSETS.sparkle;
  });
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return response.json();
}

function normalizeDisplayName(name) {
  return name.replaceAll("Ｘ", "X").replaceAll("Ｙ", "Y");
}

function buildGachaPool(sprites, poolConfig) {
  const spritesByApiName = new Map(sprites.map((sprite) => [sprite.apiName, sprite]));

  return poolConfig.entries
    .map((entry) => {
      const sprite = spritesByApiName.get(entry.apiName);
      const weight = Number(entry.weight);

      if (!sprite || !Number.isFinite(weight) || weight <= 0) {
        return null;
      }

      return {
        ...sprite,
        name: normalizeDisplayName(sprite.name),
        weight,
      };
    })
    .filter(Boolean);
}

async function loadGachaPool() {
  const [sprites, poolConfig] = await Promise.all([loadJson(DATA_SOURCES.sprites), loadJson(DATA_SOURCES.pool)]);
  activePoolLabel = poolConfig.label || poolConfig.regulation || activePoolLabel;
  gachaPool = buildGachaPool(sprites, poolConfig);

  if (gachaPool.length === 0) {
    throw new Error("No drawable Pokemon in the active gacha pool.");
  }

  resultName.textContent = "準備OK";
  resultText.textContent = `${activePoolLabel}で使えるメガシンカ ${gachaPool.length}種類から抽選します。`;
  renderChips(["M-A", `${gachaPool.length}種類`, "weight編集対応"]);
}

function pickResult() {
  if (gachaPool.length === 1) {
    lastApiName = gachaPool[0].apiName;
    return gachaPool[0];
  }

  let picked = null;
  let guard = 0;

  while ((!picked || picked.apiName === lastApiName) && guard < 12) {
    const totalWeight = gachaPool.reduce((sum, result) => sum + result.weight, 0);
    let cursor = Math.random() * totalWeight;

    picked = gachaPool[gachaPool.length - 1];
    for (const result of gachaPool) {
      cursor -= result.weight;
      if (cursor <= 0) {
        picked = result;
        break;
      }
    }

    guard += 1;
  }

  lastApiName = picked.apiName;
  return picked;
}

function renderChips(labels) {
  partyList.replaceChildren(
    ...labels.map((label) => {
      const chip = document.createElement("span");
      chip.className = "party-chip";
      chip.textContent = label;
      return chip;
    }),
  );
}

function renderResult(result) {
  resultName.textContent = result.name;
  resultSprite.src = result.src;
  resultSprite.alt = result.name;
  resultText.textContent = `${activePoolLabel}で排出されました。`;
  renderChips([result.apiName, `weight ${result.weight}`]);
  resultPanel.classList.add("has-result");
  resultPanel.classList.remove("is-entering");
  void resultPanel.offsetWidth;
  resultPanel.classList.add("is-entering");
}

function setBusy(nextBusy) {
  isDrawing = nextBusy;
  drawButton.disabled = nextBusy || gachaPool.length === 0;
  leverButton.disabled = nextBusy || gachaPool.length === 0;
  document.body.classList.toggle("is-busy", nextBusy);
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForAnimationEnd(element, animationName, fallbackMs) {
  return new Promise((resolve) => {
    let isResolved = false;

    const cleanup = () => {
      element.removeEventListener("animationend", handleAnimationEnd);
    };

    const finish = () => {
      if (isResolved) {
        return;
      }

      isResolved = true;
      cleanup();
      resolve();
    };

    const handleAnimationEnd = (event) => {
      if (event.target === element && event.animationName === animationName) {
        finish();
      }
    };

    element.addEventListener("animationend", handleAnimationEnd);
    window.setTimeout(finish, fallbackMs);
  });
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(resolve);
    });
  });
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
  });
}

function setFlashOrigin() {
  const machineRect = machine.getBoundingClientRect();
  const originX = machineRect.left + machineRect.width * BALL_END_POINT.x;
  const originY = machineRect.top + machineRect.height * BALL_END_POINT.y;
  const farthestCorner = Math.max(
    Math.hypot(originX, originY),
    Math.hypot(window.innerWidth - originX, originY),
    Math.hypot(originX, window.innerHeight - originY),
    Math.hypot(window.innerWidth - originX, window.innerHeight - originY),
  );
  const flashScale = (farthestCorner + FLASH_EFFECT_MARGIN) / FLASH_EFFECT_WHITE_RADIUS;

  document.documentElement.style.setProperty("--flash-origin-x", `${originX}px`);
  document.documentElement.style.setProperty("--flash-origin-y", `${originY}px`);
  document.documentElement.style.setProperty("--flash-scale", Math.max(flashScale, 18).toFixed(2));
}

async function drawGacha() {
  if (isDrawing || gachaPool.length === 0) {
    return;
  }

  setBusy(true);
  const result = pickResult();
  resultPanel.classList.remove("has-result", "is-entering");
  document.body.classList.remove("is-flashing", "is-whiteout-exiting");

  machine.dataset.state = "pulled";
  await wait(300);
  machine.dataset.state = "pulling";
  await wait(1000);
  machine.dataset.state = "dispensing";
  await Promise.all([wait(DISPENSE_BALL_MIN_MS), waitForAnimationEnd(closedBallElement, "dispenseBall", DISPENSE_BALL_FALLBACK_MS)]);
  machine.dataset.state = "opening";
  setFlashOrigin();
  await waitForNextPaint();
  await wait(OPEN_BALL_PREVIEW_MS);
  machine.dataset.state = "flash";
  document.body.classList.add("is-flashing");
  await wait(760);
  renderResult(result);
  machine.dataset.state = "result";
  document.body.classList.remove("is-flashing");
  document.body.classList.add("is-whiteout-exiting");
  await wait(280);
  document.body.classList.remove("is-whiteout-exiting");
  setBusy(false);
}

async function init() {
  setAssetSources();
  drawButton.disabled = true;
  leverButton.disabled = true;

  try {
    await Promise.all([preloadImage(ASSETS.ballClosed), preloadImage(ASSETS.ballOpen), preloadImage(ASSETS.ballOpenEffect), loadGachaPool()]);
  } catch (error) {
    console.error(error);
    resultName.textContent = "読み込み失敗";
    resultText.textContent = "メガシンカの排出プールを読み込めませんでした。ローカル確認時はHTTPサーバー経由で開いてください。";
    renderChips(["JSON読み込みエラー"]);
  } finally {
    setBusy(false);
  }
}

drawButton.addEventListener("click", drawGacha);
leverButton.addEventListener("click", drawGacha);
init();
