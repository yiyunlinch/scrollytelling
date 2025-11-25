const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
let currentPageIndex = 0;
let pages = [];
let eyeOpened = false; // 首屏眼睛是否已通过滚轮打开
let eyeScattered = false; // 首屏羊轮廓是否已散开
let eyeLockUntil = 0;  // 首屏阶段的冷却时间戳，防止同一轮滚动直接翻页

function easeInOutQuad(t) {
  return t < 0.5
    ? 2 * t * t
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

window.addEventListener('DOMContentLoaded', () => {
  pages = Array.from(document.querySelectorAll('.page'));
  const track = document.querySelector('.cover-h-track');

  /* === 全局页面平移导航 === */
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

  function goToPage(idx, animate = true) {
    idx = clamp(idx, 0, pages.length - 1);
    currentPageIndex = idx;
    if (track) {
      track.style.transition = animate ? 'transform 0.45s ease' : 'none';
      track.style.transform = `translateX(${-idx * 100}vw)`;
    }
    pages.forEach((p, i) => p.classList.toggle('active', i === currentPageIndex));
    window.dispatchEvent(new CustomEvent('pagechange', { detail: { index: currentPageIndex }}));
  }

  // 初始定位第一页
  goToPage(0, false);

  // Wheel 导航
  let wheelLock = false;
  window.addEventListener('wheel', e => {
    if (currentPageIndex === 0) {
      const now = performance.now();
      // 第一次下滑：仅睁眼
      if (e.deltaY > 0 && !eyeOpened) {
        e.preventDefault();
        eyeOpened = true;
        eyeLockUntil = now + 600; // 吸收惯性
        window.dispatchEvent(new Event('eye-open'));
        return;
      }
      // 冷却期内阻止翻页/散开
      if (now < eyeLockUntil) {
        e.preventDefault();
        return;
      }
      // 第二次下滑：轮廓散开
      if (e.deltaY > 0 && eyeOpened && !eyeScattered) {
        e.preventDefault();
        eyeScattered = true;
        eyeLockUntil = now + 400;
        window.dispatchEvent(new Event('eye-scatter'));
        return;
      }
    }

    if (wheelLock) return;
    wheelLock = true;
    setTimeout(() => wheelLock = false, 200);

    const dir = e.deltaY > 0 ? 1 : -1;
    if (dir === 0) return;
    e.preventDefault();
    goToPage(currentPageIndex + dir);
  }, { passive: false });

/* ====== 第4页眼睛交互（只显示 Maxi5） ====== */
(function initEyePage5() {
  const eyeWindow   = document.getElementById('eyeWindow5');
  const maxiImage   = document.getElementById('maxiImage5');
  const clickOverlay = document.getElementById('clickOverlay5');
  const clickIcon    = document.getElementById('clickIcon5');
  const blackBg     = eyeWindow?.closest('.eye-interaction-container')?.querySelector('.black-background');
  const sheepOutline = document.querySelector('.sheep-outline');

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

  if (eyeWindow && maxiImage && clickOverlay && blackBg) {
    // 初始为闭眼状态
    closeEye();

    clickOverlay.addEventListener('click', toggleEye);
    if (clickIcon) clickIcon.addEventListener('click', toggleEye);

    // 支持滚轮触发打开
    window.addEventListener('eye-open', () => {
      if (!isOpen) {
        isOpen = true;
        openEye();
      }
    });

    // 支持滚轮触发轮廓散开（第2次下滑）
    window.addEventListener('eye-scatter', () => {
      if (!sheepOutline) return;
      if (sheepOutline.classList.contains('scatter-out')) return;
      sheepOutline.classList.add('scatter-out');
      setTimeout(() => { sheepOutline.style.visibility = 'hidden'; }, 1000);
    });
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
      if (!btn) return;
      btn.addEventListener('click', e => {
        e.preventDefault();
        goToPage(1);
      });
    })();
  } catch (e) { console.error('initArrow error', e); }

  // 原首屏滚动滑页逻辑已整合到全局导航，单独逻辑移除



  /* ====== 小货车 (第10页) 往左循环，按页激活 ====== */
  try {
    function initMovingAnimOnce(elemId, pageIdx) {
      const elem = document.getElementById(elemId);
      if (!elem) return;

      let x = window.innerWidth;
      const speed = 1.25;
      const elemWidth = 180;
      let running = false;

      function animate() {
        if (!running) return;
        x -= speed;
        if (x < -elemWidth * 3) x = window.innerWidth;
        elem.style.left = `${x}px`;
        requestAnimationFrame(animate);
      }

      function onPageChange(idx) {
        running = idx === pageIdx;
        if (running) {
          x = window.innerWidth;
          requestAnimationFrame(animate);
        }
      }

      window.addEventListener('resize', () => { x = window.innerWidth; }, { passive: true });
      window.addEventListener('pagechange', e => onPageChange(e.detail.index));
      onPageChange(currentPageIndex);
    }
    initMovingAnimOnce('transporterAnim', 9);
  } catch (e) { console.error('initMovingAnimOnce error', e); }

 /* ====== 挖土机：第8页内循环，按页激活 ====== */
(function initDiggerFixed() {
  const digger = document.getElementById('digger-fixed');
  if (!digger) return;

  let x = window.innerWidth;
  const baseSpeed = 4;
  let running = false;

  function step() {
    if (!running) return;
    x -= baseSpeed;
    if (x < -360) x = window.innerWidth * 1.2;
    digger.style.left = x + 'px';
    requestAnimationFrame(step);
  }

  function onPageChange(idx) {
    const active = idx === 7; // page8
    running = active;
    digger.style.display = active ? 'block' : 'none';
    if (active) {
      x = window.innerWidth * 1.2;
      requestAnimationFrame(step);
    }
  }

  window.addEventListener('resize', () => { x = window.innerWidth; }, { passive: true });
  window.addEventListener('pagechange', e => onPageChange(e.detail.index));
  onPageChange(currentPageIndex);
})();

 
 
  /* ====== 第9页 Kinder 上浮 + 对白图（按页激活） ====== */
  try {
    (function initKinderAndDialogOnPage8() {
      const kinderImg  = document.getElementById('kinderImg');
      const schauLeft  = document.getElementById('schauLeft');
      const schauRight = document.getElementById('schauRight');

      if (!kinderImg || !schauLeft || !schauRight) return;

      function activate(active) {
        if (active) {
          kinderImg.style.transform = 'translateY(0%)';
          schauLeft.style.opacity = '1';
          schauRight.style.opacity = '1';
        } else {
          kinderImg.style.transform = 'translateY(100%)';
          schauLeft.style.opacity = '0';
          schauRight.style.opacity = '0';
        }
      }

      window.addEventListener('pagechange', e => activate(e.detail.index === 8));
      activate(currentPageIndex === 8);
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

  function updateHand(active) {
    handImg.classList.toggle('visible', active);
  }

  window.addEventListener('pagechange', e => updateHand(e.detail.index === 0));
  updateHand(currentPageIndex === 0);
})();

/* 第1页 handhandy 草出现/消失 */

try {
  (function initHandOnPage1() {
    const page1  = document.getElementById('page1');
    const handImg = document.getElementById('handImg4');
    if (!page1 || !handImg) return;

    function updateHand(active) {
      handImg.classList.toggle('visible', active);
    }

    window.addEventListener('pagechange', e => updateHand(e.detail.index === 0));
    updateHand(currentPageIndex === 0);
  })();
} catch (e) {
  console.error('initHandOnPage4 error', e);
}




  

//* ===== HERO SHEEP：按页离散位置 ===== */
(function initHeroSheep() {
  const hero  = document.getElementById('sheephero');
  if (!hero) return;

  // index -> {x%, y%, scale}
  const poses = {
    5: { x: 50, y: 20, s: 1.0 },  // page6
    6: { x: 45, y: 25, s: 0.6 },  // page7
    7: { x: 35, y: 35, s: 0.3 }   // page8
  };

  function applyPose(idx) {
    const pose = poses[idx];
    const active = !!pose;
    hero.style.opacity = active ? '1' : '0';
    if (!active) return;
    hero.style.position = 'fixed';
    hero.style.left = `${pose.x}%`;
    hero.style.top  = `${pose.y}%`;
    hero.style.transform = `translate(-50%, -50%) scale(${pose.s})`;
  }

  window.addEventListener('pagechange', e => applyPose(e.detail.index));
  applyPose(currentPageIndex);
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

/* 第6页：pole 显隐（按页） */
(function initPoleOnPage6() {
  const pole  = document.getElementById('poleImg');
  if (!pole) return;
  const toggle = active => pole.classList.toggle('visible', active);
  window.addEventListener('pagechange', e => toggle(e.detail.index === 5));
  toggle(currentPageIndex === 5);
})();

/* 第7页：pol1 显隐（按页） */
(function initPol1OnPage7() {
  const pol1  = document.getElementById('pol1Img');
  if (!pol1) return;
  const toggle = active => pol1.classList.toggle('visible', active);
  window.addEventListener('pagechange', e => toggle(e.detail.index === 6));
  toggle(currentPageIndex === 6);
})();

/* Page11 handflower 显隐（按页） */
(function initLastHandflower() {
  const img = document.getElementById('lastHandflowerImg');
  if (!img) return;
  const toggle = active => img.classList.toggle('visible', active);
  window.addEventListener('pagechange', e => toggle(e.detail.index === 10));
  toggle(currentPageIndex === 10);
})();

// 统一第2/11页 click 手位置
(function unifyClickIcons() {
  ['clickIcon5', 'clickIconFinal'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('click-pos-bottom-center');
  });
})();
