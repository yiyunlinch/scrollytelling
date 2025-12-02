const $ = (sel, root = document) => root.querySelector(sel);
let currentPageIndex = 0;
let trackPages = [];
let allPages = [];
let eyeLockUntil = 0;  // 首屏阶段的冷却时间戳，防止同一轮滚动直接翻页
let eyeStage = 0;      // 0 初始, 1 去轮廓露出眼睛, 2 溶解眼层+hero, 3 可翻页
let heroStarted = false; // 防止重复启动 hero
let globalScrollLockUntil = 0; // 全局冷却，任意滚动翻页后生效
let hold34Stage = 0;    // 第3->4页下滑停顿：0未停顿,1已停顿,2已通过
let hold34LockUntil = 0;
let privatStage = 0;   // page6 过渡：0 未触发，1 已掉落，2 可翻页
let privatLockUntil = 0;
let housePlayed = false;
let housePlaying = false;
let kinderVanish = () => {}; // 第6页孩童下落隐藏

function startHeroOnce() {
  if (heroStarted) return;
  heroStarted = true;
  window.dispatchEvent(new Event('hero-start'));
}

window.addEventListener('DOMContentLoaded', () => {
  trackPages = Array.from(document.querySelectorAll('.cover-h-track .page'));
  allPages   = Array.from(document.querySelectorAll('.page'));
  const page3Elem = document.getElementById('page3');
  const track = document.querySelector('.cover-h-track');
  const TRACK_COUNT = trackPages.length;

  /* === 全局页面导航（仅前2页横滑） === */
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function setActive(idx) {
    allPages.forEach((p, i) => p.classList.toggle('active', i === idx));
  }
  function dispatchPageChange(idx) {
    if (idx === currentPageIndex) {
      setActive(idx);
      return;
    }
    currentPageIndex = idx;
    setActive(idx);
    window.dispatchEvent(new CustomEvent('pagechange', { detail: { index: currentPageIndex }}));
  }

  function goToPage(idx, animate = true) {
    idx = clamp(idx, 0, TRACK_COUNT - 1);
    const target = trackPages[idx];
    const globalIdx = allPages.indexOf(target);
    if (track) {
      track.style.transition = animate ? 'transform 0.45s ease' : 'none';
      track.style.transform = `translateY(${-idx * 100}vh)`; // 竖向滑动
    }
    if (globalIdx >= 0) {
      dispatchPageChange(globalIdx);
    }
    // 进入新页面后添加冷却，防止连续翻页
    globalScrollLockUntil = performance.now() + 650;
  }

  // 初始定位第一页
  goToPage(0, false);

  // 进入第2页时再尝试触发 hero 羊出现（仅当 Maxi 已露出）
  window.addEventListener('pagechange', e => {
    if (e.detail.index === 1) {
      startHeroOnce();
    }
  });

  /* ====== 第1页：三张图分三次下拉 ====== */
  const eyeLayers = (() => {
    const topLayer = document.querySelector('.eye-layer-top');       // sheepblack.jpg
    const midLayer = document.querySelector('.eye-layer-middle');    // sheepeye.png
    const baseLayer = document.querySelector('.eye-layer-base');     // Maxi5 背景
    const visitsText = document.getElementById('visitsText');

    function showMid() {
      if (topLayer) topLayer.style.opacity = '0';
      if (midLayer) {
        midLayer.style.opacity = '1';
        midLayer.classList.remove('dissolve');
      }
    }

    function dissolveMid() {
      if (midLayer) {
        midLayer.classList.add('dissolve');
      }
    }

    function showText() {
      if (visitsText) visitsText.classList.add('show');
    }

    function reset() {
      if (topLayer) topLayer.style.opacity = '1';
      if (midLayer) {
        midLayer.style.opacity = '0';
        midLayer.classList.remove('dissolve');
      }
      if (baseLayer) baseLayer.style.opacity = '1';
      if (visitsText) visitsText.classList.remove('show');
    }

    if (midLayer) {
      midLayer.addEventListener('animationend', () => {
        startHeroOnce();
      }, { once: true });
    }

    reset();
    return { showMid, dissolveMid, showText, reset };
  })();

  /* Page6 掉落 privat */
  const privatDrop = (() => {
    const el = document.getElementById('privatDrop');
    const page6 = document.getElementById('page6');
    if (!el || !page6) return { drop: () => {}, reset: () => {} };

    function lockAtCurrentPosition() {
      // 动画结束后，将元素锁定到 page6 内的绝对定位，跟随页面滚动
      const rect = el.getBoundingClientRect();
      const pageRect = page6.getBoundingClientRect();
      const topRelativeToPage = rect.top - pageRect.top;
      el.style.position = 'absolute';
      el.style.top = `${topRelativeToPage}px`;
      el.style.left = '50%';
      el.style.transform = 'translate(-50%, 0) scale(1)';
      el.style.animation = 'none';
      el.style.opacity = '1'; // 保持可见
      el.style.zIndex = '2000';
      el.classList.add('landed');
      el.classList.remove('show');
    }

    // 动画结束时锁定
    el.addEventListener('animationend', lockAtCurrentPosition);

    function drop() {
      el.classList.remove('show', 'landed');
      el.style.position = 'fixed';
      el.style.top = '0';
      el.style.left = '50%';
      el.style.transform = 'translate(-50%, -200vh) scale(1)';
      el.style.animation = '';
      el.style.zIndex = '2000';
      // 强制重排以重播动画
      void el.offsetWidth;
      el.classList.add('show');
    }
    function reset() {
      el.classList.remove('show', 'landed');
      el.style.position = '';
      el.style.top = '';
      el.style.left = '';
      el.style.transform = '';
      el.style.animation = '';
      el.style.opacity = '';
      el.style.zIndex = '';
    }
    reset();
    return { drop, reset };
  })();

  /* Page6 house 视频 */
  const houseAnim = (() => {
    const wrap = document.getElementById('houseVideoWrap');
    const video = document.getElementById('houseVideo');
    if (!wrap || !video) return {
      play: () => {},
      reset: () => {}
    };

    const DURATION_MS = 6000;

    function show() {
      wrap.classList.add('visible');
    }
    function hide() {
      wrap.classList.remove('visible');
    }
    function reset() {
      housePlayed = false;
      housePlaying = false;
      hide();
      video.pause();
      video.currentTime = 0;
    }
    function freezeAtEnd() {
      housePlaying = false;
      housePlayed = true;
      try {
        const target = Math.min(video.duration || 6, 6);
        video.currentTime = target;
      } catch (e) {}
      video.pause();
      show();
    }
    function playOnce() {
      if (housePlaying || housePlayed) return;
      housePlaying = true;
      show();
      video.currentTime = 0;
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
      // 保险：到6s时强制冻结在末帧
      setTimeout(freezeAtEnd, DURATION_MS + 100);
    }

    video.addEventListener('ended', freezeAtEnd);

    return { play: playOnce, reset };
  })();

  window.addEventListener('pagechange', e => {
    const idx = e.detail.index;
    if (idx === 5) {
      privatStage = 0; // 进入第6页时重置掉落
      privatDrop.reset();
      houseAnim.reset();
    } else if (idx <= 3) {
      privatStage = 0; // 上拉到第4页及以上时清零并收起
      privatDrop.reset();
      houseAnim.reset();
    }
    if (idx <= 2) {
      hold34Stage = 0; // 回到第3页或更上方时重置停顿
      hold34LockUntil = 0;
    }
    // 其他页保持当前状态
  });

  // Wheel 导航 + 首屏分阶段
  const EYE_COOLDOWN = 650;
  const HERO_REVEAL_COOLDOWN = 900; // 第二次下拉后停留的冷冻时间
  const PAGE_AFTER_MAXI_COOLDOWN = 1000; // Maxi5 -> 下一页额外冷却
  const PRIVAT_COOLDOWN = 700; // page6 掉落冷却
  const HOUSE_COOLDOWN = 7000; // house 动画播放完成前的冷却

  function setEyeCooldown(extra = 0) {
    const now = performance.now();
    const lock = now + EYE_COOLDOWN + extra;
    eyeLockUntil = lock;
    globalScrollLockUntil = Math.max(globalScrollLockUntil, lock);
  }

  function setPrivatCooldown(extra = 0) {
    const now = performance.now();
    privatLockUntil = now + PRIVAT_COOLDOWN + extra;
    globalScrollLockUntil = Math.max(globalScrollLockUntil, privatLockUntil);
  }

  function isPage3GateActive() {
    if (!page3Elem) return false;
    const rect = page3Elem.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const visible = rect.top < vh && rect.bottom > 0;
    if (!visible) return false;
    // 当第3页底部接近视口底部时触发停顿窗口
    const bottomNearBottom = rect.bottom < vh * 1.05 && rect.bottom > vh * 0.35;
    return bottomNearBottom;
  }

  window.addEventListener('wheel', e => {
    const dir = e.deltaY > 0 ? 1 : -1;
    if (dir === 0) return;

    const now = performance.now();
    const stillCooling = now < Math.max(eyeLockUntil, privatLockUntil, globalScrollLockUntil);
    const inTrack = currentPageIndex < TRACK_COUNT;
    const onPage34 = currentPageIndex >= 2 && currentPageIndex <= 3;

    if (inTrack && currentPageIndex === 0 && dir > 0) {
      if (stillCooling) {
        e.preventDefault();
        return;
      }

      if (eyeStage === 0) {
        e.preventDefault();
        eyeStage = 1;
        eyeLayers.showMid();
        setEyeCooldown();
        return;
      }
      if (eyeStage === 1) {
        e.preventDefault();
        eyeStage = 2;
        eyeLayers.dissolveMid();
        eyeLayers.showText();
        setEyeCooldown(HERO_REVEAL_COOLDOWN);
        return;
      }
      if (eyeStage === 2) {
        e.preventDefault();
        eyeStage = 3;
        setEyeCooldown();
        globalScrollLockUntil = Math.max(globalScrollLockUntil, performance.now() + PAGE_AFTER_MAXI_COOLDOWN);
        goToPage(1);
        return;
      }
    }

    if (!inTrack) {
      // Page3 -> Page4：第一次下滑先停顿，第二次才继续（当前在第3/第4页都拦一次）
      const needHold34 = dir > 0 && hold34Stage < 2 && onPage34 && isPage3GateActive();
      if (needHold34) {
        const nowTs = performance.now();
        if (hold34Stage === 0) {
          e.preventDefault();
          hold34Stage = 1;
          hold34LockUntil = nowTs + 600; // 稍作停顿
          globalScrollLockUntil = Math.max(globalScrollLockUntil, hold34LockUntil);
          return;
        }
        if (hold34Stage === 1) {
          if (nowTs < hold34LockUntil) {
            e.preventDefault();
            return;
          }
          // 第二次下滑，放行并标记完成
          hold34Stage = 2;
        }
      }
      // page6 -> page7 过渡：先冷却，再掉落 privat，再下一次滚动才允许翻页
      if (currentPageIndex === 5 && dir > 0) {
        if (now < Math.max(privatLockUntil, globalScrollLockUntil)) {
          e.preventDefault();
          return;
        }
        if (privatStage === 0) {
          // 第一次滚动：只进入冷却，仍停留在第6页
          e.preventDefault();
          privatStage = 1;
          setPrivatCooldown(500);
          return;
        } else if (privatStage === 1) {
          // 第二次滚动：触发掉落动画，仍停留在第6页
          e.preventDefault();
          privatStage = 2;
          privatDrop.drop();
          setPrivatCooldown(600); // 掉落后稍作停顿
          return;
        } else if (privatStage === 2) {
          // 第三次滚动：让孩童快速下落消失，仍留在第6页
          if (stillCooling) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          privatStage = 3;
          kinderVanish();
          setPrivatCooldown(600);
          return;
        } else if (privatStage === 3) {
          // 第四次滚动：播放 house 视频，仍留在第6页
          if (housePlaying) {
            e.preventDefault();
            return;
          }
          if (housePlayed) {
            // 如果已经播过，直接进入下一阶段
            privatStage = 4;
          } else {
            e.preventDefault();
            houseAnim.play();
            privatStage = 4;
            globalScrollLockUntil = Math.max(globalScrollLockUntil, performance.now() + HOUSE_COOLDOWN);
            return;
          }
        } else if (privatStage === 4) {
          // house 播放后，下一次滚动才能放行
          if (stillCooling) {
            e.preventDefault();
            return;
          }
          // 释放到下一页，标记完成
          privatStage = 5;
        }
      }
      return; // 后面正常竖向滚动
    }

    // 在横向区域内，若已在最后一页且继续向下，交给正常滚动，但遵守冷却
    if (currentPageIndex === TRACK_COUNT - 1 && dir > 0) {
      if (stillCooling) {
        e.preventDefault();
        return;
      }
      return;
    }

    if (stillCooling) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    goToPage(currentPageIndex + dir);
    globalScrollLockUntil = performance.now() + EYE_COOLDOWN;
  }, { passive: false });

  /* ====== 竖向页面可见性触发 pagechange ====== */
  try {
    const observer = new IntersectionObserver(entries => {
      let best = null;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const ratio = entry.intersectionRatio;
        if (ratio < 0.55) continue;
        const idx = allPages.indexOf(entry.target);
        if (idx < TRACK_COUNT) continue; // 前两页由 goToPage 控制
        if (!best || ratio > best.ratio) {
          best = { idx, ratio };
        }
      }
      if (best && best.idx !== currentPageIndex) {
        dispatchPageChange(best.idx);
      }
    }, { threshold: [0.55, 0.7, 0.85] });

    allPages.slice(TRACK_COUNT).forEach(p => observer.observe(p));
  } catch (e) {
    console.error('IntersectionObserver error', e);
  }


/* ====== 小羊群：Page1 内部 + 分离力（不重叠） ====== */
(function initFlockSheepSeparated() {
  const flock = document.getElementById('flock-page1');
  if (!flock) return;

  // 抓取当前存在的羊（仅限 #flock-page1 内）
  const sheeps = Array.from(flock.querySelectorAll('.sheep')).map(el => ({ el }));
  if (!sheeps.length) return;

  // ------- 可调参数 -------
  const MAX_SPEED      = 22;     // 最高速度（px/s）
  const BASE_SPEED     = 14;     // 基础速度（px/s）
  const SAFE_RADIUS    = 520;    // 很大的分离半径，保持远距离
  const MIN_SPAWN_DIST = SAFE_RADIUS * 1.2; // 更现实的生成间距，避免无法安置
  const SEP_WEIGHT     = 1.8;    // 分离力权重，加大推开
  const WANDER_JITTER  = 6;      // 微扰随机游走强度
  const TARGET_BIAS    = 0.08;   // 向目标点的慢慢靠近

  // 内场边距（避免贴边）：左右 22%，上 5%，下 40%
  const PAD_X_FRAC      = 0.22;
  const PAD_Y_TOP_FRAC  = 0.05;
  const PAD_Y_BOT_FRAC  = 0.40;

  const rand  = (a, b) => a + Math.random() * (b - a);

  function getBounds() {
    const w = flock.clientWidth;
    const h = flock.clientHeight;
    const maxSheepSize = Math.max(...sheeps.map(s => s.el.offsetWidth || 0), 0);
    const minX = w * PAD_X_FRAC;
    const maxX = w * (1 - PAD_X_FRAC);
    const minY = h * PAD_Y_TOP_FRAC;
    // 确保整只羊在可视区域内：从可用高度中减去羊尺寸的一半，避免高度耗尽
    const maxY = Math.max(minY + 10, h * (1 - PAD_Y_BOT_FRAC) - maxSheepSize * 0.5);
    return { w, h, minX, maxX, minY, maxY };
  }

  // 初始化每只羊：位置、速度、目标点
  function spawnSheep(s, existing) {
    const { minX, maxX, minY, maxY } = getBounds();
    let tries = 0;
    do {
      s.x = rand(minX, maxX);
      s.y = rand(minY, maxY);
      tries++;
    } while (
      existing.some(o => Math.hypot(s.x - o.x, s.y - o.y) < MIN_SPAWN_DIST) &&
      tries < 40
    );
    s.vx = rand(-BASE_SPEED, BASE_SPEED);
    s.vy = rand(-BASE_SPEED, BASE_SPEED);
    pickTarget(s);
    place(s);
  }

  function pickTarget(s) {
    const { minX, maxX, minY, maxY } = getBounds();
    s.tx = rand(minX, maxX);
    s.ty = rand(minY, maxY);
  }

  function place(s) {
    s.el.style.left = s.x + 'px';
    s.el.style.top  = s.y + 'px';
  }

  sheeps.forEach((s, idx) => spawnSheep(s, sheeps.slice(0, idx)));

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

      // 软性边界：保持在内场矩形内
      const { minX, maxX, minY, maxY } = getBounds();
      if (s.x < minX) { s.x = minX; s.vx = Math.abs(s.vx); }
      if (s.x > maxX) { s.x = maxX; s.vx = -Math.abs(s.vx); }
      if (s.y < minY) { s.y = minY; s.vy = Math.abs(s.vy); }
      if (s.y > maxY) { s.y = maxY; s.vy = -Math.abs(s.vy); }

      // 硬性推开：若仍然过近，直接位移开
      for (const o of sheeps) {
        if (o === s) continue;
        const dx = s.x - o.x;
        const dy = s.y - o.y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist < SAFE_RADIUS * 0.7) {
          const push = (SAFE_RADIUS * 0.7 - dist) * 0.6;
          s.x += (dx / dist) * push;
          s.y += (dy / dist) * push;
        }
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
initMovingAnimOnce('transporterAnim', 7);
  } catch (e) { console.error('initMovingAnimOnce error', e); }

/* ====== 挖土机：第8页内循环，按页激活 ====== */
(function initDiggerFixed() {
  const digger = document.getElementById('digger-fixed');
  const container = document.getElementById('page5');
  if (!digger || !container) return;

  let running = false;
  let dir = -1; // -1: right -> left, 1: left -> right
  let x = 0;
  const SPEED = 3.75;  // 水平移动速度（减半）
  const MARGIN = 80;  // 保持原外侧缓冲
  const BASE_SCALE = 5; // 与 CSS 初始 scale 保持一致
  let firstRun = true;
  let flipSign = 1; // 1 不翻，-1 反转，之后每次出屏切换
  let activePage = false;
  let leaving = false; // 离开第5页时继续跑到出屏后隐藏
  let leaveStart = 0;
  const EXIT_TIMEOUT = 2000; // 最长离场时间

  function bounds() {
    const w = container.clientWidth || window.innerWidth;
    const ew = (digger.offsetWidth || 180) * BASE_SCALE;
    return { left: -ew - MARGIN, right: w + ew + MARGIN };
  }

  function applyTransform() {
    digger.style.left = `${x}px`;
    digger.style.top = '50%'; // 始终沿着容器中线
    digger.style.transform = `translate(-50%, -50%) scale(${BASE_SCALE}) scaleX(${flipSign})`;
  }

  function resetSide(nextDir) {
    dir = nextDir;
    if (firstRun) {
      firstRun = false;    // 首次不翻转
    } else {
      flipSign *= -1;      // 之后每次出屏都翻转
    }
    const { left, right } = bounds();
    x = dir === -1 ? right : left;
    applyTransform();
  }

  function step() {
    if (!running) return;
    const { left, right } = bounds();
    x += dir * SPEED;
    if (dir === -1 && x <= left) {
      resetSide(1);  // 到左侧后反转，改为左->右
    } else if (dir === 1 && x >= right) {
      resetSide(-1); // 到右侧后反转，改为右->左
    } else {
      applyTransform();
    }

    // 离场逻辑：若正在离开，出了屏幕后隐藏
    if (leaving) {
      const out = (dir === -1 && x <= left) || (dir === 1 && x >= right);
      const expired = performance.now() - leaveStart > EXIT_TIMEOUT;
      if (out || expired) {
        running = false;
        digger.style.display = 'none';
        leaving = false;
        return;
      }
    }
    requestAnimationFrame(step);
  }

  function onPageChange(idx) {
    const shouldBeActive = idx === 4; // page5
    if (shouldBeActive && !activePage) {
      activePage = true;
      leaving = false;
      running = true;
      digger.style.display = 'block';
      firstRun = true;
      flipSign = 1;
      resetSide(-1); // 进入时从右往左
      requestAnimationFrame(step);
    } else if (!shouldBeActive && activePage) {
      // 离开时保持当前方向跑到出屏再隐藏
      activePage = false;
      leaving = true;
      running = true;
      digger.style.display = 'block';
      leaveStart = performance.now();
      requestAnimationFrame(step);
    }
  }

  window.addEventListener('resize', () => resetSide(dir), { passive: true });
  window.addEventListener('pagechange', e => onPageChange(e.detail.index));
  onPageChange(currentPageIndex);
})();

 
 
  /* ====== 第9页 Kinder 上浮 + 对白图（按页激活，支持快速下落消失） ====== */
  try {
    (function initKinderAndDialogOnPage8() {
      const kinderImg  = document.getElementById('kinderImg');
      const schauLeft  = document.getElementById('schauLeft');
      const schauRight = document.getElementById('schauRight');

      if (!kinderImg || !schauLeft || !schauRight) return;

      function activate(active) {
        if (active) {
          kinderImg.style.transition = 'transform 0.7s ease';
          kinderImg.style.transform = 'translateY(0%)';
          schauLeft.style.opacity = '1';
          schauRight.style.opacity = '1';
        } else {
          kinderImg.style.transition = 'transform 0.7s ease';
          kinderImg.style.transform = 'translateY(100%)';
          schauLeft.style.opacity = '0';
          schauRight.style.opacity = '0';
        }
      }

      function vanishDown() {
        kinderImg.style.transition = 'transform 0.35s ease-in';
        kinderImg.style.transform = 'translateY(180%)';
        schauLeft.style.opacity = '0';
        schauRight.style.opacity = '0';
      }

      kinderVanish = vanishDown;

      window.addEventListener('pagechange', e => activate(e.detail.index === 5));
      activate(currentPageIndex === 5);
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

  window.addEventListener('pagechange', e => updateHand(e.detail.index === 1));
  updateHand(currentPageIndex === 1);
})();

/* 第1页 handhandy 草出现/消失 */

try {
(function initHandOnPage6() {
  const page6  = document.getElementById('page3');
  const handImg = document.getElementById('handImg4');
  if (!page6 || !handImg) return;

  function updateHand(active) {
    handImg.classList.toggle('visible', active);
  }

  window.addEventListener('pagechange', e => updateHand(e.detail.index === 2));
  updateHand(currentPageIndex === 2);
})();
} catch (e) {
  console.error('initHandOnPage6 error', e);
}




  

//* ===== HERO SHEEP：第4页中段向右离场，向上反向返回 ===== */
(function initHeroSheep() {
  const hero  = document.getElementById('sheephero');
  const page4 = document.getElementById('page4');
  if (!hero) return;

  let running = false;
  const baseX = 50;     // 正常位置
  const exitX = 170;    // 向右离场的位置（超出视口）
  const baseY = 60;
  const EXIT_START = 0.0; // 刚进入第4页就开始离场
  const EXIT_END   = 1.00; // 离场区间再拉长，离场更慢
  const ENTRY_FROM = -30;  // 初次出现时从左侧进入
  const ENTRY_DURATION = 2200; // ms，更慢的入场

  const clamp01 = v => Math.max(0, Math.min(1, v));

  function page4Progress() {
    if (!page4) return 0;
    const rect = page4.getBoundingClientRect();
    const h = rect.height || window.innerHeight || 1;
    // 当 page4 顶部在视口顶时 progress=0；滚过半屏 progress≈0.5
    const progress = 1 - (rect.bottom / h);
    return clamp01(progress);
  }

  function applyPose(progress) {
    // t=0: 正常位置；t=1: 离开屏幕右侧
    const t = clamp01((progress - EXIT_START) / (EXIT_END - EXIT_START));
    const x = baseX + (exitX - baseX) * t;
    hero.style.left = `${x}%`;
    hero.style.top  = `${baseY}%`;
    hero.style.opacity = '1';
    hero.style.transform = 'translate(-50%, -50%) scale(1)';
  }

  let entryStart = 0;
  let entryDone = false;

  function step() {
    if (!running) return;
    const now = performance.now();
    if (!entryDone) {
      const t = clamp01((now - entryStart) / ENTRY_DURATION);
      const x = ENTRY_FROM + (baseX - ENTRY_FROM) * t;
      hero.style.left = `${x}%`;
      hero.style.top  = `${baseY}%`;
      hero.style.opacity = '1';
      hero.style.transform = 'translate(-50%, -50%) scale(1)';
      if (t >= 1) entryDone = true;
    } else {
      const p = page4Progress();
      applyPose(p);
    }
    requestAnimationFrame(step);
  }

  function activate() {
    if (running) return;
    running = true;
    entryStart = performance.now();
    entryDone = false;
    applyPose(page4Progress());
    hero.style.opacity = '1';
    requestAnimationFrame(step);
  }

  function deactivate() {
    running = false;
    hero.style.opacity = '0';
  }

  window.addEventListener('hero-start', () => activate());
  window.addEventListener('resize', () => {
    if (!running) return;
    applyPose(page4Progress());
  }, { passive: true });
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
  window.addEventListener('pagechange', e => toggle(e.detail.index === 2));
  toggle(currentPageIndex === 2);
})();

/* 第7页：pol1 显隐（按页） */
(function initPol1OnPage7() {
  const pol1  = document.getElementById('pol1Img');
  if (!pol1) return;
  let isVisible = false;
  const toggle = active => {
    if (isVisible === active) return;
    isVisible = active;
    pol1.classList.toggle('visible', active);
  };

  window.addEventListener('pagechange', e => {
    toggle(e.detail.index >= 3); // 到达或经过本页保持出现，回到更上方收回
  });

  window.addEventListener('scroll', () => {
    toggle(currentPageIndex >= 3);
  }, { passive: true });

  toggle(currentPageIndex >= 3);
})();

/* Page11 handflower 显隐（按页） */
(function initLastHandflower() {
  const img = document.getElementById('lastHandflowerImg');
  if (!img) return;
  const toggle = active => img.classList.toggle('visible', active);
  window.addEventListener('pagechange', e => toggle(e.detail.index === 6));
  toggle(currentPageIndex === 6);
})();

// 统一第2/11页 click 手位置
(function unifyClickIcons() {
  const el = document.getElementById('clickIconFinal');
  if (el) el.classList.add('click-pos-bottom-center');
})();
