const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function easeInOutQuad(t) {
  return t < 0.5
    ? 2 * t * t
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function smoothScrollToY(targetY, duration = 800) {
  const startY = window.scrollY || window.pageYOffset;
  const delta = targetY - startY;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = easeInOutQuad(p);
    window.scrollTo(0, startY + delta * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

window.addEventListener('DOMContentLoaded', () => {

  /* ====== 第4页眼睛交互（只显示 Maxi5） ====== */
(function initEyePage5() {
  const eyeWindow   = document.getElementById('eyeWindow5');
  const maxiImage   = document.getElementById('maxiImage5');
  const clickOverlay = document.getElementById('clickOverlay5');
  const clickIcon    = document.getElementById('clickIcon5');
  const blackBg     = eyeWindow?.closest('.eye-interaction-container')?.querySelector('.black-background');

  // ✅ 仅保留一张图片
  const IMG = './images/Maxi/Maxi5.jpg';

  let isOpen = false;

  if (maxiImage) {
    maxiImage.style.transition = 'opacity 0.25s ease';
  }

  function showImg() {
    if (!maxiImage) return;
    maxiImage.style.opacity = '0';
    setTimeout(() => {
      maxiImage.src = IMG;
      maxiImage.onload = () => { maxiImage.style.opacity = '1'; };
    }, 20);
  }

  function closeEye() {
    blackBg.style.opacity = '1';
    blackBg.style.pointerEvents = 'auto';
    eyeWindow.classList.remove('open');

    // 还原闭眼状态
    eyeWindow.querySelectorAll('.eye-lid').forEach(l => l.style.height = '');
    maxiImage.style.opacity = '0';
    setTimeout(() => { maxiImage.src = ''; }, 200);
  }

  function openEye() {
    blackBg.style.opacity = '0';
    blackBg.style.pointerEvents = 'none';
    eyeWindow.classList.add('open');

    // 让眼皮张开
    eyeWindow.querySelectorAll('.eye-lid').forEach(l => l.style.height = '0px');

    // ✅ 始终显示同一张图
    showImg();
  }

  function toggleEye() {
    isOpen = !isOpen;
    if (isOpen) openEye();
    else closeEye();
  }

  if (eyeWindow && maxiImage && clickOverlay && clickIcon && blackBg) {
    // 初始为闭眼状态
    closeEye();

    clickOverlay.addEventListener('click', toggleEye);
    clickIcon.addEventListener('click', toggleEye);
  }
})();


/* ====== 小羊群：Page1 内部 + 分离力（不重叠） ====== */
(function initFlockSheepSeparated() {
  const flock = document.getElementById('flock-page1');
  if (!flock) return;

  // 抓取当前存在的羊（仅限 #flock-page1 内）
  const sheeps = Array.from(flock.querySelectorAll('.sheep')).map(el => ({ el }));
  if (!sheeps.length) return;

  // ------- 可调参数 -------
  const MAX_SPEED      = 26;     // 最高速度（px/s）
  const BASE_SPEED     = 18;     // 基础速度（px/s）
  const SAFE_RADIUS    = 220;    // 分离感知半径（越大越不容易靠太近）
  const SEP_WEIGHT     = 1.10;   // 分离力权重（再挤一点就加大）
  const WANDER_JITTER  = 9;      // 微扰随机游走强度（越大越飘）
  const TARGET_BIAS    = 0.04;   // 向目标点的“慢慢靠近”权重

  // 垂直活动带：放开到全屏高度
  const TOP_BAND = 0.00;
  const Y_MAX_FRAC = 1.00;

  const rand  = (a, b) => a + Math.random() * (b - a);

  function getBounds() {
    return { w: flock.clientWidth, h: flock.clientHeight };
  }
  function yMin(h){ return h * TOP_BAND; }
  function yMax(h){ return h * Y_MAX_FRAC; }

  // 初始化每只羊：位置、速度、目标点
  function spawnSheep(s) {
    const { w, h } = getBounds();
    s.x = rand(w * 0.08, w * 0.92);
    s.y = rand(yMin(h),  yMax(h));
    s.vx = rand(-BASE_SPEED, BASE_SPEED);
    s.vy = rand(-BASE_SPEED, BASE_SPEED);
    pickTarget(s);
    place(s);
  }

  function pickTarget(s) {
    const { w, h } = getBounds();
    s.tx = rand(w * 0.08, w * 0.92);
    s.ty = rand(yMin(h),  yMax(h));
  }

  function place(s) {
    s.el.style.left = s.x + 'px';
    s.el.style.top  = s.y + 'px';
  }

  sheeps.forEach(spawnSheep);

  // 主循环
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    const { w, h } = getBounds();

    // —— 计算分离力（避免重叠）——
    for (let i = 0; i < sheeps.length; i++) {
      const s = sheeps[i];

      // 目标引导（轻微靠向自己的目标点，避免一直原地打转）
      const toTargetX = (s.tx - s.x);
      const toTargetY = (s.ty - s.y);

      // 随机微扰（wander）
      const jitterX = (Math.random() - 0.5) * WANDER_JITTER;
      const jitterY = (Math.random() - 0.5) * WANDER_JITTER;

      // 分离累计向量
      let sepX = 0, sepY = 0, count = 0;

      for (let j = 0; j < sheeps.length; j++) {
        if (i === j) continue;
        const o = sheeps[j];
        const dx = s.x - o.x;
        const dy = s.y - o.y;
        const dist = Math.hypot(dx, dy);

        if (dist > 0 && dist < SAFE_RADIUS) {
          // 距离越近，反推越大（1/dist 衰减）
          const inv = 1 / dist;
          sepX += dx * inv;
          sepY += dy * inv;
          count++;
        }
      }

      if (count > 0) {
        sepX /= count;
        sepY /= count;
        // 归一化+加权
        const len = Math.hypot(sepX, sepY) || 1;
        sepX = (sepX / len) * (MAX_SPEED * SEP_WEIGHT);
        sepY = (sepY / len) * (MAX_SPEED * SEP_WEIGHT);
      }

      // 边界推回（靠近边缘时给一个反向力，保证不越界）
      // 合成速度：旧速度 + 分离 + 目标轻拉 + 微扰
      s.vx += sepX * dt + toTargetX * TARGET_BIAS * dt + jitterX;
      s.vy += sepY * dt + toTargetY * TARGET_BIAS * dt + jitterY;

      // 限速
      const spd = Math.hypot(s.vx, s.vy);
      if (spd > MAX_SPEED) {
        const k = MAX_SPEED / (spd || 1);
        s.vx *= k;
        s.vy *= k;
      }
    }

    // —— 位置更新 + 目标点刷新 + 画面放置 —— 
    for (const s of sheeps) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;

      // 到达目标附近则换一个新目标
      if (Math.hypot(s.tx - s.x, s.ty - s.y) < 24) {
        pickTarget(s);
      }

      place(s);
    }

    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => {
    // 窗口变动时刷新目标，避免越界
    sheeps.forEach(pickTarget);
  }, { passive: true });

  requestAnimationFrame(tick);
})();

  /* ====== 第1页箭头：滚到第2页 ====== */
  try {
    (function initArrow() {
      const btn = $('#toPage2');
      const page2 = $('#page2'); // 新的空白草地页
      if (!btn || !page2) return;
      btn.addEventListener('click', e => {
        e.preventDefault();
        smoothScrollToY(page2.offsetTop, 800);
      });
    })();
  } catch (e) { console.error('initArrow error', e); }



  /* ====== 小货车 (第9页) 往左循环 ====== */
  try {
    function initMovingAnimOnce(elemId, containerId) {
      const elem = document.getElementById(elemId);
      const container = document.getElementById(containerId);
      if (!elem || !container) return;

      let x = window.innerWidth;
      const speed = 1.25;
      const elemWidth = 180;

      function animate() {
        x -= speed;
        if (x < -elemWidth * 3) x = window.innerWidth;
        elem.style.left = `${x}px`;
        if (elem._animating) requestAnimationFrame(animate);
      }

      function onScroll() {
        const rect = container.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          if (!elem._animating) {
            elem._animating = true;
            requestAnimationFrame(animate);
          }
        } else {
          elem._animating = false;
        }
      }

      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll, { passive: true });
      onScroll();
    }
    initMovingAnimOnce('transporterAnim', 'page10');
  } catch (e) { console.error('initMovingAnimOnce error', e); }

 /* ====== 挖土机：第7页内循环；离开第7页后以3倍速收尾 ====== */
(function initDiggerFixed() {
  const digger = document.getElementById('digger-fixed');
  const page8 = document.getElementById('page8');
  if (!digger || !page8) return;

  // 状态
  // "idle"：不在范围或已完全收尾隐藏
  // "running"：在第6页范围内循环右进左出
  // "finishing"：离开范围后做最后一趟，以 3x 速度跑出屏幕
  let state = "idle";

  let x = window.innerWidth;
  const baseSpeed = 4;     // 原始速度
  let curSpeed = baseSpeed; // 当前速度（finishing 时提到 3x）
  const approxWidth = 180 * 2; // ~360px (scale(5))
  let animating = false;

  function inActiveRange() {
    const scrollY = window.scrollY || window.pageYOffset;
    const viewMid = scrollY + window.innerHeight * 0.5;
    const startY = page8.offsetTop;
    const endY   = page8.offsetTop + page8.offsetHeight;
    return viewMid >= startY && viewMid <= endY;
  }

  function startFromRight() {
    digger.style.display = 'block';
    x = window.innerWidth * 2;
    digger.style.left = x + 'px';
    curSpeed = baseSpeed; // 进入 running 恢复正常速度
    state = "running";
  }

  function step() {
    if (state === "idle") {
      animating = false;
      return;
    }

    x -= curSpeed;
    digger.style.left = x + 'px';

    if (state === "running") {
      // 在范围内循环
      if (x + approxWidth < 0) {
        if (inActiveRange()) {
          x = window.innerWidth + 40;
          digger.style.left = x + 'px';
        } else {
          // 离开范围，进入 finishing，并把速度提到 3x
          state = "finishing";
          curSpeed = baseSpeed * 3;
        }
      }
    } else if (state === "finishing") {
      // 只做最后一趟，3x 速度直至完全出屏
      if (x + approxWidth < 0) {
        digger.style.display = 'none';
        state = "idle";
        animating = false;
        return;
      }
    }

    requestAnimationFrame(step);
  }

  function ensureAnimating() {
    if (!animating) {
      animating = true;
      requestAnimationFrame(step);
    }
  }

  function handleScrollState() {
    const active = inActiveRange();

    if (active) {
      if (state === "idle") {
        startFromRight();                 // 进入范围 → 出现并以正常速度循环
      } else if (state === "finishing") {
        // 用户又滚回来了 → 继续 running，并把速度恢复
        state = "running";
        curSpeed = baseSpeed;
      }
    } else {
      if (state === "running") {
        // 离开范围 → 进入 finishing，并把速度提到 3x
        state = "finishing";
        curSpeed = baseSpeed * 3;
      }
    }

    if (state !== "idle") ensureAnimating();
  }

  window.addEventListener('scroll', handleScrollState, { passive: true });
  window.addEventListener('resize', handleScrollState, { passive: true });
  handleScrollState();
})();

 
 
  /* ====== 第9页 Kinder 上浮 + 对白图 ====== */
  try {
    (function initKinderAndDialogOnPage8() {
      const page9      = document.getElementById('page9');
      const kinderImg  = document.getElementById('kinderImg');
      const schauLeft  = document.getElementById('schauLeft');
      const schauRight = document.getElementById('schauRight');

      if (!page9 || !kinderImg || !schauLeft || !schauRight) return;

      let dialogShown = false; // 只触发一次

      function updateKinderAndMaybeShowDialog() {
        const rect = page9.getBoundingClientRect();
        const vh   = window.innerHeight;

        // 让第7页底边接近视口底部的倒数200px，驱动孩子往上浮
        const bottomToViewportBottom = vh - rect.bottom;
// 👉 新增“提前量”，单位 px，数值越大，出现越早
const EARLY_START = 400;   // 你可以改 300/600 微调早晚
const revealDistance = 200;

// 关键：把提前量加进触发
let progress = (bottomToViewportBottom + EARLY_START) / revealDistance;

// 仍然做 0~1 的夹取
if (progress < 0) progress = 0;
if (progress > 1) progress = 1;

        if (progress < 0) progress = 0;
        if (progress > 1) progress = 1;

        // translateY: 100% -> 0%
        const translatePercent = 100 * (1 - progress);
        kinderImg.style.transform = `translateY(${translatePercent}%)`;

        // 完全出现后，展示对白
        if (progress >= 1 && !dialogShown) {
          dialogShown = true;
          schauLeft.style.opacity  = '1';
          schauRight.style.opacity = '1';
        }
      }

      window.addEventListener('scroll', updateKinderAndMaybeShowDialog, { passive: true });
      window.addEventListener('resize', updateKinderAndMaybeShowDialog, { passive: true });

      updateKinderAndMaybeShowDialog();
    })();
  } catch (e) {
    console.error('initKinderAndDialogOnPage8 error', e);
  }

}); // END DOMContentLoaded

/* ====== 第1页 hand 图片出现/消失（草地手） ====== */

/* 第1页 handhandy 图片出现/消失 */
(function initHandhandyOnPage1() {
  const page1 = document.getElementById('page1');
  const handImg = document.getElementById('handhandyImg');
  if (!page1 || !handImg) return;

  function updateHand() {
    const rect = page1.getBoundingClientRect();
    const vh = window.innerHeight;

    // ✅ 提前出现
    const visible = rect.top < vh * 0.7 && rect.bottom > vh * 0.2;
    handImg.classList.toggle('visible', visible);
  }

  window.addEventListener('scroll', updateHand, { passive: true });
  window.addEventListener('resize', updateHand, { passive: true });
  updateHand();
})();

/* 第1页 handhandy 草出现/消失 */

try {
  (function initHandOnPage1() {
    const page1  = document.getElementById('page1');
    const handImg = document.getElementById('handImg4');
    if (!page1 || !handImg) return;

    function updateHand() {
      const rect = page1.getBoundingClientRect();
      const vh   = window.innerHeight;

      // 第1页进入可见区时显示（阈值可微调）
      const visible = rect.top < vh * 0.25 && rect.bottom > vh * 0.4;
      handImg.classList.toggle('visible', visible);
    }

    window.addEventListener('scroll', updateHand, { passive: true });
    window.addEventListener('resize', updateHand, { passive: true });
    updateHand();
  })();
} catch (e) {
  console.error('initHandOnPage4 error', e);
}




  

//* ===== HERO SHEEP：第5→第7页 路径 + 锚定第7页顶部 ===== */
(function initHeroSheep() {
  const hero  = document.getElementById('sheephero');
  const page6 = document.getElementById('page6');
  const page8 = document.getElementById('page8');
  if (!hero || !page6 || !page8) return;

  function updateHero() {
    const r5 = page6.getBoundingClientRect();
    const r7 = page8.getBoundingClientRect();
    const vh = window.innerHeight;

    // 出现与隐藏规则
    const beforePage5 = r5.top >= vh * 0.10;    // 第5页还没到
    const afterPage7  = r7.bottom <= 0;         // 第7页滚过去
    const shouldShow  = !beforePage5 && !afterPage7;

    hero.style.opacity = shouldShow ? '1' : '0';
    if (!shouldShow) return;

    // 进度 t: 0=第5页起点 → 1=第7页顶部
    let t = 1 - Math.min(Math.max(r5.bottom / vh, 0), 1);

    // 路径参数
    const startY = 0.20;   // 屏幕上 20%
    const endY   = 0.35;   // 第7页出现时，停在屏幕上方 30%
    const startX = 0.50;   // 居中
    const endX   = 0.35;   // 左侧 20%
    const startScale = 1.00;
    const endScale   = 0.3; // ✅ 缩小

    // 插值
    const y = startY + (endY - startY) * t;
    const s = startScale + (endScale - startScale) * t;
    const xPos = startX + (endX - startX) * t;

    hero.style.transform = `translate(-50%, -50%) scale(${s})`;

    // 如果还没到第7页顶，按轨迹走
    if (t < 1) {
      hero.style.position = 'fixed';
      hero.style.left = `${xPos * 100}%`;
      hero.style.top  = `${y * 100}%`;
    } else {
      // ✅ 到终点后，跟随第7页顶部一起上升
      hero.style.position = 'fixed';
      const offset = Math.min(r7.top, 0); 
      hero.style.left = `${endX * 100}%`;
      hero.style.top = `calc(${endY * 100}% + ${offset}px)`;
    }
  }

  window.addEventListener('scroll', updateHero, { passive: true });
  window.addEventListener('resize', updateHero, { passive: true });
  updateHero();
})();

/* === 通用：点击切换显隐（支持来回切换） === */
function clickToggle(iconId, targetId) {
  const icon = document.getElementById(iconId);
  const target = document.getElementById(targetId);
  if (!icon || !target) return;

  icon.addEventListener('click', () => {
    const willShow = !target.classList.contains('show');
    target.classList.toggle('show', willShow);
    // 保险：同步内联 opacity，避免旧样式残留
    target.style.opacity = willShow ? '1' : '0';
  });
}

/* === 最后一页绑定：手 ↔ 文字 === */
document.addEventListener('DOMContentLoaded', () => {
  clickToggle('clickIconFinal', 'finalText');
});

/* 第5页：pole 出现/消失（右下从右侧滑入） */
(function initPoleOnPage5() {
  const page6 = document.getElementById('page6');
  const pole  = document.getElementById('poleImg');
  if (!page6 || !pole) return;

  function updatePole() {
    const rect = page6.getBoundingClientRect();
    const vh   = window.innerHeight;
    // 早点出现：0.8 / 0.2 （可改成 0.9 / 0.1 更早）
    const visible = rect.top < vh * 0.2 && rect.bottom > vh * 0.01;
    pole.classList.toggle('visible', visible);
  }

  window.addEventListener('scroll', updatePole, { passive: true });
  window.addEventListener('resize', updatePole, { passive: true });
  updatePole();
})();

/* 第6页：pol1 出现/消失（右下从右侧滑入） */
(function initPol1OnPage6() {
  const page7 = document.getElementById('page7');
  const pol1  = document.getElementById('pol1Img');
  if (!page7 || !pol1) return;

  function updatePol1() {
    const rect = page7.getBoundingClientRect();
    const vh   = window.innerHeight;
    // 早点出现：0.8 / 0.2
    const visible = rect.top < vh * 0.3 && rect.bottom > vh * 0.01;
    pol1.classList.toggle('visible', visible);
  }

  window.addEventListener('scroll', updatePol1, { passive: true });
  window.addEventListener('resize', updatePol1, { passive: true });
  updatePol1();
})();

/* Page10 handflower appear/disappear */
(function initLastHandflower() {
  const page11 = document.getElementById('page11');
  const img = document.getElementById('lastHandflowerImg');
  if (!page11 || !img) return;

  function update() {
    const rect = page11.getBoundingClientRect();
    const vh = window.innerHeight;
    const visible = rect.top < vh * 0.2 && rect.bottom > vh * 0.4;
    img.classList.toggle('visible', visible);
  }

  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
})();

// 统一第2/11页 click 手位置
(function unifyClickIcons() {
  ['clickIcon5', 'clickIconFinal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('click-pos-bottom-center');
  });
})();
