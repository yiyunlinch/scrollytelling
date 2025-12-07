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
let privatStage = 0;   // page5-6 过渡：0 未触发，2 已掉落，3 盖楼阶段，4 孩童消失，5 放行，6 完成
let privatLockUntil = 0;
let kinderVanish = () => {}; // 第6页孩童下落隐藏
let kinderForceVisible = false; // 强制 Kinder/对白保持显示，直到主动消失
let kinderLockedHidden = false; // 一旦隐藏则锁死，不再自动出现
let buildingIndex = -1; // 当前盖楼层级 -1 表示未显示
let page2DownGuardUntil = 0; // 第2页向下滑动后，短暂阻止回弹回 Maxi
let kinderAudio = null;
let kinderFadeRAF = null;
let kinderTargetVolume = 0;
let kinderPlaying = false;
let kinderShouldPlay = false; // 仅在第2/3页播放
let kinderPlayPending = false;
let sheepAudio = null;
let sheepPlaying = false;
let sheepPlayPending = false;
let sheepShouldPlay = false; // 仅在第7页播放
let noiceAudio = null;
let noicePlaying = false;
let noicePlayPending = false;
let noiceShouldPlay = false; // 第5-6页播放
let birdAudio = null;
let birdPlaying = false;
let birdPlayPending = false;
let birdShouldPlay = false; // 第1页播放
let hasLeftMaxiPage = false; // 是否曾离开过第一页（Maxi 层）
const MAXI_SEEN_KEY = 'maxiSeen'; // session 标记：是否离开过第1页
let heroAllowCheck = () => true; // 是否允许触发 hero（基于当前可见页）
let firstInteractionBound = false;
let audioKickstarted = false;
let audioMuted = true; // 跟随喇叭状态

function isElementVisible(el, threshold = 0.35) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || 1;
  const vw = window.innerWidth || 1;
  if (rect.bottom <= 0 || rect.top >= vh) return false;
  if (rect.right <= 0 || rect.left >= vw) return false;
  const visibleHeight = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
  const visibleRatio = visibleHeight / Math.max(1, rect.height);
  return visibleRatio >= threshold;
}
const setViewportHeightVar = () => {
  const vh = (window.innerHeight || document.documentElement.clientHeight || 0) * 0.01;
  if (vh > 0) {
    document.documentElement.style.setProperty('--vh', `${vh}px`);
  }
};
setViewportHeightVar();
window.addEventListener('resize', setViewportHeightVar, { passive: true });
window.addEventListener('orientationchange', setViewportHeightVar, { passive: true });

// Page5 文字/对白显隐
let setPage5ContentVisibility = () => {};
function stopKinderFade() {
  if (kinderFadeRAF) {
    cancelAnimationFrame(kinderFadeRAF);
    kinderFadeRAF = null;
  }
}

function fadeKinder(toVolume, duration = 800, stopAfter = false) {
  if (!kinderAudio) return;
  stopKinderFade();
  const from = kinderAudio.volume;
  const to = Math.max(0, Math.min(1, toVolume));
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const v = from + (to - from) * t;
    kinderAudio.volume = v;
    if (t < 1) {
      kinderFadeRAF = requestAnimationFrame(step);
    } else {
      kinderFadeRAF = null;
      if (stopAfter) {
        kinderAudio.pause();
        kinderAudio.currentTime = 0;
        kinderPlaying = false;
      }
    }
  }
  kinderFadeRAF = requestAnimationFrame(step);
}

function startKinderAudio() {
  if (!kinderAudio || audioMuted) return;
  kinderShouldPlay = true;
  stopKinderFade();
  try {
    kinderAudio.muted = false;
    if (!kinderPlaying) {
      kinderAudio.currentTime = 0;
      kinderAudio.loop = true;
      kinderAudio.play().then(() => {
        kinderPlaying = true;
        kinderPlayPending = false;
      }).catch(() => {
        kinderPlayPending = true; // 等待用户手势再尝试
      });
    }
  } catch (e) {
    console.warn('kinder audio play failed', e);
  }
  kinderAudio.volume = 0;
  fadeKinder(1, 1200);
}

function fadeOutKinder(stopRequest = false) {
  if (!kinderAudio || !kinderPlaying) {
    if (stopRequest) {
      kinderShouldPlay = false;
      kinderPlayPending = false;
    }
    return;
  }
  fadeKinder(0, 1200, true);
  if (stopRequest) {
    kinderShouldPlay = false;
    kinderPlayPending = false;
  }
}

function ensureKinderPlaybackIfNeeded() {
  if (kinderShouldPlay && (!kinderPlaying || kinderPlayPending)) {
    startKinderAudio();
  }
}

function startSheepAudio() {
  if (!sheepAudio || audioMuted) return;
  sheepShouldPlay = true;
  try {
    sheepAudio.muted = false;
    sheepAudio.loop = true;
    if (!sheepPlaying) {
      sheepAudio.currentTime = 0;
      sheepAudio.play().then(() => {
        sheepPlaying = true;
        sheepPlayPending = false;
      }).catch(() => {
        sheepPlayPending = true;
      });
    }
  } catch (e) {
    console.warn('sheep audio play failed', e);
  }
}

function stopSheepAudio() {
  if (!sheepAudio) return;
  sheepAudio.pause();
  sheepAudio.currentTime = 0;
  sheepPlaying = false;
  sheepPlayPending = false;
}

function ensureSheepPlaybackIfNeeded() {
  if (sheepShouldPlay && (!sheepPlaying || sheepPlayPending)) {
    startSheepAudio();
  }
}

function startNoiceAudio() {
  if (!noiceAudio || audioMuted) return;
  noiceShouldPlay = true;
  try {
    noiceAudio.muted = false;
    noiceAudio.loop = true;
    if (!noicePlaying) {
      noiceAudio.currentTime = 0;
      noiceAudio.play().then(() => {
        noicePlaying = true;
        noicePlayPending = false;
      }).catch(() => {
        noicePlayPending = true;
      });
    }
  } catch (e) {
    console.warn('noice audio play failed', e);
  }
}

function stopNoiceAudio() {
  if (!noiceAudio) return;
  noiceAudio.pause();
  noiceAudio.currentTime = 0;
  noicePlaying = false;
  noicePlayPending = false;
}

function ensureNoicePlaybackIfNeeded() {
  if (noiceShouldPlay && (!noicePlaying || noicePlayPending)) {
    startNoiceAudio();
  }
}

function startBirdAudio() {
  if (!birdAudio || audioMuted) return;
  birdShouldPlay = true;
  try {
    birdAudio.muted = false;
    birdAudio.loop = true;
    if (!birdPlaying) {
      birdAudio.currentTime = 0;
      birdAudio.play().then(() => {
        birdPlaying = true;
        birdPlayPending = false;
      }).catch(() => {
        birdPlayPending = true;
      });
    }
  } catch (e) {
    console.warn('bird audio play failed', e);
  }
}

function stopBirdAudio() {
  if (!birdAudio) return;
  birdAudio.pause();
  birdAudio.currentTime = 0;
  birdPlaying = false;
  birdPlayPending = false;
}

function ensureBirdPlaybackIfNeeded() {
  if (birdShouldPlay && (!birdPlaying || birdPlayPending)) {
    startBirdAudio();
  }
}

function tryPlayPendingBird() {
  if (!birdAudio || !birdPlayPending || !birdShouldPlay) return;
  startBirdAudio();
}

function kickstartAllAudio() {
  if (audioKickstarted) return;
  audioKickstarted = true;
  if (kinderShouldPlay) {
    startKinderAudio();
    tryPlayPendingKinder();
  }
  ensureNoicePlaybackIfNeeded();
  ensureSheepPlaybackIfNeeded();
  ensureBirdPlaybackIfNeeded();
}

function startHeroOnce() {
  if (heroStarted) return;
  if (!heroAllowCheck()) return;
  heroStarted = true;
  window.dispatchEvent(new Event('hero-start'));
}

  window.addEventListener('DOMContentLoaded', () => {
    trackPages = Array.from(document.querySelectorAll('.cover-h-track .page'));
    allPages   = Array.from(document.querySelectorAll('.page'));
    kinderAudio = document.getElementById('kinderAudio');
    sheepAudio  = document.getElementById('sheepAudio');
    noiceAudio  = document.getElementById('noiceAudio');
    birdAudio   = document.getElementById('birdAudio');
    const page3Elem = document.getElementById('page3');
    const track = document.querySelector('.cover-h-track');
    const page1 = document.getElementById('page1');
    const page2 = document.getElementById('page2');
    const page3 = document.getElementById('page3');
    const page4 = document.getElementById('page4');
    const page1ClickIcon = document.getElementById('clickIconPage1');
    const downArrow = document.getElementById('globalDownArrow');
    let page1ArrowReady = false;
    let triggerPage1Advance = null;

    function markPage1ArrowReady() {
      if (page1ArrowReady) return;
      page1ArrowReady = true;
      syncPage1Arrow();
    }

    function syncPage1Arrow() {
      if (!downArrow) return;
      const idx = currentPageIndex;
      const withinRange = idx <= 5;
      const allowPage1 = page1ArrowReady;
      const shouldShow = withinRange && (idx > 0 || allowPage1);
      downArrow.classList.toggle('show', shouldShow);
      downArrow.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
    }

    const hidePage1ClickIcon = () => {
      if (page1ClickIcon) {
        page1ClickIcon.classList.add('is-hidden');
      }
    };
    const TRACK_COUNT = 1; // 仅首屏使用特殊逻辑，其余页面按正常竖向流动
  let seenFromSession = false;
  try {
    seenFromSession = sessionStorage.getItem(MAXI_SEEN_KEY) === '1';
  } catch (err) {
    seenFromSession = false;
  }

function requestKinderPlay() {
  if (!kinderShouldPlay) return;
  startKinderAudio();
  tryPlayPendingKinder();
}

function playPageAudio(idx) {
  // bird：第1页
  if (idx === 0) {
    birdShouldPlay = true;
      startBirdAudio();
  } else {
    birdShouldPlay = false;
    stopBirdAudio();
  }
  // kinder：用于第2/3页
    kinderShouldPlay = (idx === 1 || idx === 2);
    if (kinderShouldPlay) {
      requestKinderPlay();
    } else {
      fadeOutKinder(true);
    }
    // sheep：第7页
    if (idx === 6) {
      sheepShouldPlay = true;
      startSheepAudio();
    } else {
      sheepShouldPlay = false;
      stopSheepAudio();
    }
    // noice：第5/6页
    if (idx === 4 || idx === 5) {
      noiceShouldPlay = true;
      startNoiceAudio();
    } else {
      noiceShouldPlay = false;
      stopNoiceAudio();
    }
}

  function findMostVisiblePageIndex() {
    const vh = window.innerHeight || 1;
    let bestIdx = 0;
    let bestScore = 0;
    allPages.forEach((p, idx) => {
      const rect = p.getBoundingClientRect();
      const visible = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
      if (visible <= 0) return;
      const ratio = visible / Math.max(rect.height, 1);
      if (ratio > bestScore) {
        bestScore = ratio;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  /* === 全局页面导航（仅前2页横滑） === */
  function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
  function setActive(idx) {
    allPages.forEach((p, i) => p.classList.toggle('active', i === idx));
  }
  function dispatchPageChange(idx, force = false) {
    if (idx === currentPageIndex && !force) {
      setActive(idx);
      return;
    }
    currentPageIndex = idx;
    setActive(idx);
    window.dispatchEvent(new CustomEvent('pagechange', { detail: { index: currentPageIndex }}));
  }

  // 刷新时先同步当前可见页，避免进入第6页时残留第5页元素闪现
  currentPageIndex = findMostVisiblePageIndex();
  setActive(currentPageIndex);
  document.body.classList.toggle('page6-plus', currentPageIndex >= 5);
  if (currentPageIndex > 0) {
    markPage1ArrowReady();
  } else {
    syncPage1Arrow();
  }
  // 刷新时根据当前页尝试启动对应音频
  playPageAudio(currentPageIndex);
  // 默认就尝试启动音频请求（若被策略拦截，后续交互再重试）
  requestKinderPlay();
  ensureNoicePlaybackIfNeeded();
  ensureSheepPlaybackIfNeeded();
  ensureBirdPlaybackIfNeeded();
  // 尽早尝试自动播放（若被策略拦截，将在首个交互捕获后再尝试）
  kickstartAllAudio();

  function goToPage(idx, animate = true) {
    idx = clamp(idx, 0, allPages.length - 1);
    const target = allPages[idx];
    if (!target) return;
    try {
      target.scrollIntoView({ behavior: animate ? 'smooth' : 'auto', block: 'start' });
    } catch (err) {
      // 回退：不支持平滑滚动的环境直接设置
      const top = target.getBoundingClientRect().top + window.pageYOffset;
      window.scrollTo({ top, behavior: animate ? 'smooth' : 'auto' });
    }
    dispatchPageChange(idx);
    // 进入新页面后添加冷却，防止连续翻页
    globalScrollLockUntil = performance.now() + 650;
  }

  // 初始定位第一页（仅在未看过首屏时强制）
  if (!seenFromSession) {
    goToPage(0, false);
  }

  // 如果刷新时停在第2页或更下方（例如第3页），直接触发 hero，避免刷新后消失
  function maybeStartHeroFromScroll() {
    const visibleEnough = el => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      return rect.top < vh * 0.65 && rect.bottom > vh * 0.35;
    };
    if (visibleEnough(document.getElementById('page2')) ||
        visibleEnough(document.getElementById('page3'))) {
      startHeroOnce();
    }
  }
  requestAnimationFrame(maybeStartHeroFromScroll);

  // hero 触发条件：仅当第1-4页有可见区域时才允许
  heroAllowCheck = () => {
    return (
      isElementVisible(page1, 0.6) ||
      isElementVisible(page2, 0.25) ||
      isElementVisible(page3, 0.25) ||
      isElementVisible(page4, 0.25)
    );
  };

  // 进入第2页时再尝试触发 hero 羊出现（仅当 Maxi 已露出）
  window.addEventListener('pagechange', e => {
    const idx = e.detail.index;
    if (idx > 0) {
      hasLeftMaxiPage = true;
      try {
        sessionStorage.setItem(MAXI_SEEN_KEY, '1');
      } catch (err) {
        console.warn('sessionStorage set failed', err);
      }
    }
    playPageAudio(idx);
    // 进入前几页（含从下方往上回拉至第4/3页）都可触发 hero，保证刷新后上拉也能出现
    if (idx === 1 || idx === 2) {
      startHeroOnce();
    }
    // 从下方向上返回第一页时，直接露出 Maxi 背景，不停留在 sheepblack
    if (idx === 0 && hasLeftMaxiPage) {
      eyeStage = 3;
      eyeLayers.revealBase();
    }
  });

  // 滚动时补发文案解锁，保证上拉回到 page2/3 能看到 besuche/jeder
  window.addEventListener('scroll', () => {
    if (unlockOnScroll) unlockOnScroll();
    if (ensureManualByVisibility) ensureManualByVisibility();
    // 若已离开过首屏且当前回到 page1，可见时确保露出 Maxi5 而不是 sheepblack
    const page1 = document.getElementById('page1');
    if (page1 && hasLeftMaxiPage && eyeLayers && typeof eyeLayers.revealBase === 'function') {
      if (isVisibleEnough(page1, 0.4)) {
        eyeStage = 3;
        eyeLayers.revealBase();
        const stack = page1.querySelector('.eye-interaction-container');
        if (stack) {
          stack.style.visibility = 'visible';
        }
      }
    }
  }, { passive: true });

  /* ====== 第1页：三张图分三次下拉 ====== */
  const eyeLayers = (() => {
    const topLayer = document.querySelector('.eye-layer-top');       // sheepblack.jpg
    const midLayer = document.querySelector('.eye-layer-middle');    // sheepeye.png
    const baseLayer = document.querySelector('.eye-layer-base');     // Maxi5 背景
    const visitsText = document.getElementById('visitsText');
    const page1 = document.getElementById('page1');
    const stack = page1 ? page1.querySelector('.eye-interaction-container') : null;

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

    function revealBase() {
      // 强制露出 Maxi5 背景（从下往上回到第一页时用）
      if (topLayer) topLayer.style.opacity = '0';
      if (midLayer) {
        midLayer.style.opacity = '0';
        midLayer.classList.add('dissolve');
      }
      if (baseLayer) baseLayer.style.opacity = '1';
      if (visitsText) visitsText.classList.add('show');
      hidePage1ClickIcon();
      markPage1ArrowReady();
      syncPage1Arrow();
    }

    if (midLayer) {
      midLayer.addEventListener('animationend', () => {
        startHeroOnce();
      }, { once: true });
    }

    // 首次渲染：根据 session 记录决定是否跳过遮罩；若当前就在 page1，则仍保留遮罩
    const initialOnPage1 = (() => {
      if (!page1) return true;
      const rect = page1.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const mostlyVisible = rect.top <= 0 && rect.bottom >= vh * 0.8;
      const nearTop = (window.scrollY || window.pageYOffset || 0) < 10;
      return mostlyVisible && nearTop;
    })();
    try {
      const seen = sessionStorage.getItem(MAXI_SEEN_KEY) === '1';
      if (seen && !initialOnPage1) {
        hasLeftMaxiPage = true;
        eyeStage = 3;
        revealBase();
      } else {
        reset(); // 首次或当前停在 page1 时保留遮罩
        if (stack) stack.style.visibility = 'visible';
      }
    } catch (err) {
      reset();
      if (stack) stack.style.visibility = 'visible';
    }
    return { showMid, dissolveMid, showText, reset, revealBase };
  })();

  /* Page5 掉落 privat */
  const privatDrop = (() => {
    const el = document.getElementById('privatDrop');
    const page5 = document.getElementById('page5');
    if (!el || !page5) return { drop: () => {}, reset: () => {} };

    function lockAtCurrentPosition() {
      // 动画结束后，锁定到 page5 中线位置（底边落在页面高度的 50%）
      const box = el.getBoundingClientRect();
      const h = box.height || 0;
      const targetBottom = page5.clientHeight * 0.5;
      const topRelativeToPage = Math.max(0, targetBottom - h);
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

    let dropTimer = null;

    function drop() {
      // 清理旧定时
      if (dropTimer) {
        clearTimeout(dropTimer);
        dropTimer = null;
      }

      // 计算目标位置：底边落在 page5 高度的 50%
      const box = el.getBoundingClientRect();
      const h = box.height || 0;
      const targetBottom = page5.clientHeight * 0.5;
      const targetTop = Math.max(0, targetBottom - h);

      el.classList.remove('show', 'landed');
      el.style.position = 'absolute';
      el.style.left = '50%';
      el.style.top = `${-Math.max(window.innerHeight, page5.clientHeight)}px`; // 从页面上方开始
      el.style.transform = 'translate(-50%, 0) scale(1)';
      el.style.animation = '';
      el.style.zIndex = '2000';
      el.style.opacity = '0';
      el.style.transition = 'none';

      // 强制重排以应用起点
      void el.offsetWidth;

      // 设置落点并启动过渡
      el.style.transition = 'top 0.9s ease-out, opacity 0.45s ease-out';
      el.style.top = `${targetTop}px`;
      el.style.opacity = '1';

      // 过渡结束后锁定最终状态
      dropTimer = setTimeout(() => {
        lockAtCurrentPosition();
        dropTimer = null;
      }, 950);
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
  const buildingAnim = (() => {
    const wrap = document.getElementById('houseVideoWrap');
    const layers = wrap ? Array.from(wrap.querySelectorAll('.building-layer')) : [];
    const nurOverlay = document.getElementById('nurOverlay');
    if (!wrap || !layers.length) return {
      reset: () => {},
      setIndex: () => {},
      step: () => {},
      max: 0,
      index: () => -1,
    };

    function apply(idx) {
      if (idx < 0) {
        wrap.classList.remove('visible');
        layers.forEach(l => l.style.opacity = '0');
        setPage5ContentVisibility(true);
        if (nurOverlay) nurOverlay.classList.remove('show');
        return;
      }
      wrap.classList.add('visible');
      layers.forEach((l, i) => {
        l.style.opacity = i <= idx ? '1' : '0';
      });
      if (nurOverlay) {
        const lastIndex = layers.length - 1;
        nurOverlay.classList.toggle('show', idx >= lastIndex);
      }
      setPage5ContentVisibility(false); // 盖楼开始后隐藏 Kinder/文本
    }

    function setIndex(idx) {
      const clamped = Math.max(-1, Math.min(layers.length - 1, idx));
      buildingIndex = clamped;
      apply(buildingIndex);
    }

    function reset() {
      buildingIndex = -1;
      apply(buildingIndex);
    }

    return {
      reset,
      setIndex,
      step: delta => setIndex(buildingIndex + delta),
      max: layers.length - 1,
      index: () => buildingIndex,
    };
  })();

  // Page5 Kinder+文本显隐控制（盖楼开始即隐藏）
  (function initPage5ContentVisibility() {
    const kinderImg  = document.getElementById('kinderImg');
    const dialog     = document.getElementById('dialogOverlay');
    const textGroup  = document.querySelector('#page5 .text-group-left');
    const targets = [kinderImg, dialog, textGroup].filter(Boolean);
    const update = show => {
      targets.forEach(el => {
        el.style.transition = 'opacity 0.4s ease';
        el.style.opacity = show ? '1' : '0';
      });
    };
    setPage5ContentVisibility = update;
    const shouldShowInitially = currentPageIndex === 4 && buildingIndex < 0 && !kinderLockedHidden;
    update(shouldShowInitially);
  })();

  window.addEventListener('pagechange', e => {
    const idx = e.detail.index;
    document.body.classList.toggle('page6-plus', idx >= 5);
    const eimal = document.getElementById('eimalOverlay');
    if (eimal) {
      eimal.classList.toggle('show', idx === 6);
    }
    if (idx === 1) {
      startKinderAudio(); // 进入第2页开始淡入
      setTimeout(ensureKinderPlaybackIfNeeded, 100); // 再尝试一次
    }
    if (idx >= 3 || idx < 1) {
      fadeOutKinder(false); // 离开第3页后淡出，但保留播放意愿
    }
    if (idx === 4) {
      privatStage = 0; // 进入第5页时重置掉落
      privatDrop.reset();
      // 若从第4页点击箭头直达第5页，直接触发掉落一次
      if (privatStage < 2 && performance.now() >= Math.max(privatLockUntil, globalScrollLockUntil)) {
        privatStage = 2;
        privatDrop.drop();
        setPrivatCooldown(300);
      }
      buildingAnim.reset();
    } else if (idx <= 3) {
      privatStage = 0; // 上拉到第4页及以上时清零并收起
      privatDrop.reset();
      buildingAnim.reset();
    }
    if (idx === 5) {
      privatStage = Math.max(privatStage, 2);
      kinderForceVisible = false;
      buildingAnim.setIndex(0); // 默认显示第一层
      setPage5ContentVisibility(false); // 进入第6页隐藏 page5 内容
    } else {
      buildingAnim.reset();
      if (idx >= 5) {
        setPage5ContentVisibility(false);
      } else if (idx === 4 && buildingIndex < 0 && !kinderLockedHidden) {
        setPage5ContentVisibility(true);
      }
    }
    if (idx <= 2) {
      hold34Stage = 0; // 回到第3页或更上方时重置停顿
      hold34LockUntil = 0;
    }
    // 其他页保持当前状态
  });

  // 第6页：显示点击手势提示
  (function initPage6ClickIcon() {
    const icon = document.getElementById('clickIconPage6');
    if (!icon) return;
    const update = idx => {
      icon.classList.toggle('is-hidden', idx !== 5);
    };
    window.addEventListener('pagechange', e => update(e.detail.index));
    update(currentPageIndex);
  })();

  // Wheel 导航 + 首屏分阶段
  const EYE_COOLDOWN = 650;
  const HERO_REVEAL_COOLDOWN = 900; // 第二次下拉后停留的冷冻时间
  const PAGE_AFTER_MAXI_COOLDOWN = 1000; // Maxi5 -> 下一页额外冷却
  const PRIVAT_COOLDOWN = 300; // privat/盖楼相关冷却，更短
  const BUILD_COOLDOWN = 360; // 盖楼切换冷却（略放慢）

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
  function setBuildCooldown(extra = 0) {
    const now = performance.now();
    const lock = now + BUILD_COOLDOWN + extra;
    privatLockUntil = Math.max(privatLockUntil, lock);
    globalScrollLockUntil = Math.max(globalScrollLockUntil, lock);
  }

  // 首屏：点击（整屏或手势提示）也能按步骤睁眼
  (function initPage1ClickToOpenEye() {
    const page1 = document.getElementById('page1');
    const clickIcon = document.getElementById('clickIconPage1');
    if (!page1) return;

    const tryAdvanceEye = () => {
      if (currentPageIndex !== 0) return;
      const now = performance.now();
      const cooling = now < Math.max(eyeLockUntil, globalScrollLockUntil);
      if (cooling) return;

      if (eyeStage === 0) {
        eyeStage = 1;
        eyeLayers.showMid();
        setEyeCooldown();
        return;
      }
      if (eyeStage === 1) {
        eyeStage = 2;
        eyeLayers.revealBase();
        hidePage1ClickIcon();
        setEyeCooldown(HERO_REVEAL_COOLDOWN); // 留一点时间看 Maxi5
        return;
      }
      if (eyeStage === 2) {
        eyeStage = 3;
        setEyeCooldown();
        globalScrollLockUntil = Math.max(globalScrollLockUntil, performance.now() + PAGE_AFTER_MAXI_COOLDOWN);
        goToPage(1);
      }
    };

    page1.addEventListener('click', tryAdvanceEye);
    if (clickIcon) {
      clickIcon.addEventListener('click', e => {
        e.stopPropagation();
        tryAdvanceEye();
      });
    }
    triggerPage1Advance = tryAdvanceEye;
  })();

  /* 全局向下箭头：第1-6页显示（首屏需先露出 Maxi5） */
  (function initDownArrow() {
    if (!downArrow) return;

    const canNavigate = () => {
      const now = performance.now();
      return now >= Math.max(globalScrollLockUntil, eyeLockUntil, privatLockUntil);
    };

    downArrow.addEventListener('click', e => {
      e.preventDefault();
      if (!canNavigate()) return;

      if (currentPageIndex === 0) {
        if (!page1ArrowReady) return;
        if (typeof triggerPage1Advance === 'function') {
          triggerPage1Advance();
        } else {
          goToPage(1);
        }
        return;
      }

      if (currentPageIndex >= allPages.length - 1) return;
      goToPage(currentPageIndex + 1);
    });

    window.addEventListener('pagechange', e => {
      if (e.detail.index > 0) {
        markPage1ArrowReady();
      }
      syncPage1Arrow();
    });

    syncPage1Arrow();
  })();

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
      // 首屏仅允许点击眼睛推进，滚轮不触发阶段或跳页
      e.preventDefault();
      return;
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
      // page5 掉落 privat：一次下滚即掉落，冷却更短
      if (currentPageIndex === 4 && dir > 0) {
        if (now < Math.max(privatLockUntil, globalScrollLockUntil)) {
          e.preventDefault();
          return;
        }
        if (privatStage < 2) {
          e.preventDefault();
          privatStage = 2;
          privatDrop.drop();
          setPrivatCooldown(300); // 短冷却防连触
          return;
        }
      }
      // page6 -> page7 过渡：掉落完成后盖楼、再消失 Kinder，最后才放行
      if (currentPageIndex === 5 && dir > 0) {
        if (now < Math.max(privatLockUntil, globalScrollLockUntil)) {
          e.preventDefault();
          return;
        }
        if (privatStage < 2) {
          // 如果跳过了 page5，强制视为已掉落
          privatStage = 2;
        }
        if (privatStage === 2) {
          // 初到第6页，开始盖楼第一层已显示，滚一次才进入盖楼节奏
          if (stillCooling) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          privatStage = 3;
          setBuildCooldown(280);
          return;
        } else if (privatStage === 3) {
          // 盖楼：每次向下滚增加一层，直到最顶层
          if (buildingIndex < buildingAnim.max) {
            e.preventDefault();
            buildingAnim.step(1);
            setBuildCooldown(280);
            return;
          } else {
            // 已经到最高层，进入下一阶段
            e.preventDefault();
            privatStage = 4;
            return;
          }
        } else if (privatStage === 4) {
          // 让孩童快速下落消失，仍留在第6页
          if (stillCooling) {
            e.preventDefault();
            return;
          }
          e.preventDefault();
          privatStage = 5;
          kinderForceVisible = false;
          kinderLockedHidden = true;
          kinderVanish();
          setPrivatCooldown(320); // 顶层后仅一次短冷却
          return;
        } else if (privatStage === 5) {
          // 盖楼完成 & 孩童消失后，下一次滚动才能放行
          if (stillCooling) {
            e.preventDefault();
            return;
          }
          // 释放到下一页，标记完成（楼层保持在第6页）
          privatStage = 6;
        }
      }
      // page6 向上滚动：一层层拆楼，回到顶部才允许离开
      if (currentPageIndex === 5 && dir < 0) {
        if (buildingIndex >= 0) {
          e.preventDefault();
          buildingAnim.step(-1);
          setBuildCooldown(240);
          // 回退到无楼层时，重置阶段
          if (buildingIndex < 0) {
            privatStage = 2;
          }
          return;
        }
        // 没有楼层显示时，允许继续往上回到上一页
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
  const PAD_X_FRAC      = 0.18;  // 左右各 18%（扩大可用宽度，减少集中在右侧）
  const PAD_Y_TOP_FRAC  = 0.05;
  const PAD_Y_BOT_FRAC  = 0.25;  // 底部预留减少，扩大垂直活动区

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
  } catch (e) { console.error('initMovingAnimOnce error', e); }

/* ====== 挖土机：第8页内循环，按页激活 ====== */
(function initDiggerFixed() {
  const digger = document.getElementById('digger-fixed');
  const container = document.getElementById('page5');
  if (!digger || !container) return;

  let running = false;
  let dir = -1; // -1: right -> left, 1: left -> right
  let x = 0;
  const SPEED_PPS = 450;  // px/s，时间驱动的速度
  const MARGIN = 80;  // 保持原外侧缓冲
  const BASE_SCALE = 5; // 与 CSS 初始 scale 保持一致
  let firstRun = true;
  let flipSign = 1; // 1 不翻，-1 反转，之后每次出屏切换
  let activePage = false;
  let leaving = false; // 离开第5页时继续跑到出屏后隐藏
  let leaveStart = 0;
  let lastTime = 0;
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

  function step(now) {
    if (!running) return;
    if (!lastTime) lastTime = now;
    const dt = (now - lastTime) / 1000; // 秒
    lastTime = now;
    const { left, right } = bounds();
    x += dir * SPEED_PPS * dt;
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
      lastTime = 0;
      requestAnimationFrame(step);
    } else if (!shouldBeActive && activePage) {
      // 离开时保持当前方向跑到出屏再隐藏
      activePage = false;
      leaving = true;
      running = true;
      digger.style.display = 'block';
      leaveStart = performance.now();
      lastTime = 0;
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
      const page5      = document.getElementById('page5');

      if (!kinderImg || !schauLeft || !schauRight || !page5) return;

      let activeState = false;

      function sync(show) {
        if (kinderLockedHidden) {
          show = false;
        }
        const shouldShow = show || kinderForceVisible;
        if (shouldShow) {
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

      function activate(active) {
        activeState = active;
        sync(activeState);
      }

      function vanishDown() {
        kinderForceVisible = false;
        kinderLockedHidden = true;
        kinderImg.style.transition = 'transform 0.35s ease-in';
        kinderImg.style.transform = 'translateY(180%)';
        schauLeft.style.opacity = '0';
        schauRight.style.opacity = '0';
      }

      kinderVanish = vanishDown;

      // 由 pagechange 和额外的 IntersectionObserver 双重保障，避免偶发不触发
      window.addEventListener('pagechange', e => {
        const onPage5 = e.detail.index === 4;
        if (!kinderLockedHidden) {
          kinderForceVisible = onPage5;
        }
        // 进入第5页先收起，等可视度达标再出现
        if (onPage5 && !kinderLockedHidden && buildingIndex < 0) {
          activate(false);
        } else {
          activate(onPage5);
        }
      });

      try {
        const obs = new IntersectionObserver(entries => {
          for (const entry of entries) {
            if (entry.target !== page5) continue;
            const visible = entry.isIntersecting && entry.intersectionRatio > 0.35;
            activate(visible);
          }
        }, { threshold: [0.25, 0.35, 0.5, 0.7] });
        obs.observe(page5);
      } catch (err) {
        console.error('kinder observer error', err);
      }

      kinderForceVisible = !kinderLockedHidden && currentPageIndex === 4;
      activate(currentPageIndex === 4);
    })();
  } catch (e) {
    console.error('initKinderAndDialogOnPage8 error', e);
  }

  // 初始化后强制同步当前页状态，避免直接落在第6页时第5页元素短暂可见
  dispatchPageChange(currentPageIndex, true);

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
  const page3 = document.getElementById('page3');
  const page2 = document.getElementById('page2');
  const heroText = document.getElementById('heroText');
  const heroTextImg = document.getElementById('heroTextImg');
  let heroTextOverlay = null;
  if (!hero) return;

  // 叠加层：在显示 "Wir" 时同时呈现 "Niemand"
  if (heroText && !document.getElementById('heroTextOverlay')) {
    heroTextOverlay = document.createElement('img');
    heroTextOverlay.id = 'heroTextOverlay';
    heroTextOverlay.className = 'hero-text-overlay';
    heroTextOverlay.src = './images/text/herosheep/niemand.png';
    heroTextOverlay.alt = 'Niemand';
    heroTextOverlay.style.opacity = '0';
    heroText.appendChild(heroTextOverlay);
  } else {
    heroTextOverlay = document.getElementById('heroTextOverlay');
  }

  let running = false;
  let textUnlocked = false;  // 解锁后才能走时间轴
  let textReady = false;     // 触发 hero 5 秒后允许首帧
  let heroTextTimer = null;
  let manualOverride = false; // 第2/3页由滚动控制文案
  let manualLoop = null;
  let ensureManualByVisibility = () => {}; // 可视驱动的手动模式
  const baseX = 50;     // 正常位置
  const exitX = 170;    // 向右离场的位置（超出视口）
  const baseY = 80;     // 垂直位置更低一些
  const EXIT_START = 0.0; // 刚进入第4页就开始离场
  const EXIT_END   = 1.00; // 离场区间再拉长，离场更慢
  const ENTRY_FROM = -30;  // 初次出现时从左侧进入
  const ENTRY_DURATION = 3500; // ms，更慢的入场
  const textFrames = [
    { from: 0.0,  src: './images/text/herosheep/besuche.png', alt: 'Besuche' },
    { from: 0.22, src: './images/text/herosheep/jeder.png',   alt: 'Jeder' },
    { from: 0.44, src: './images/text/herosheep/niemand.png', alt: 'Niemand' },
    { from: 0.60, src: './images/text/herosheep/wir.png',     alt: 'Wir' },
  ];
  let currentTextFrame = -1;
  let autoAdvanceTimer = null;
  let unlockOnScroll = () => {}; // 占位，scroll 时补发解锁

  const clamp01 = v => Math.max(0, Math.min(1, v));

  // 判断元素是否可见到一定比例
  function isVisibleEnough(el, threshold = 0.35) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const vw = window.innerWidth || 1;
    if (rect.bottom <= 0 || rect.top >= vh) return false;
    if (rect.right <= 0 || rect.left >= vw) return false;
    const visibleHeight = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
    const visibleRatio = visibleHeight / Math.max(1, rect.height);
    return visibleRatio >= threshold;
  }

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
    syncTextPosition(x, baseY);
    updateTextFrame(progress);
  }

  let entryStart = 0;
  let entryDone = false;

  function syncTextPosition(xPercent, yPercent) {
    if (!heroText) return;
    heroText.style.left = `${xPercent}%`;
    heroText.style.top  = `${yPercent}%`;
  }

  function setFrame(idx) {
    if (!heroText || !heroTextImg) return;
    // 确保 overlay 存在（容错）
    if (!heroTextOverlay && heroText) {
      heroTextOverlay = document.createElement('img');
      heroTextOverlay.id = 'heroTextOverlay';
      heroTextOverlay.className = 'hero-text-overlay';
      heroTextOverlay.src = './images/text/herosheep/niemand.png';
      heroTextOverlay.alt = 'Niemand';
      heroTextOverlay.style.opacity = '0';
      heroText.appendChild(heroTextOverlay);
    }
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
    if (idx < 0) {
      heroText.style.opacity = '0';
      currentTextFrame = -1;
      if (heroTextOverlay) heroTextOverlay.style.opacity = '0';
      return;
    }
    const frame = textFrames[idx];
    if (!frame) return;
    heroTextImg.src = frame.src;
    heroTextImg.alt = frame.alt || 'hero text';
    heroText.style.opacity = '1';
    currentTextFrame = idx;
    if (heroTextOverlay) {
      const showOverlay = idx === 3; // Wir 时叠加 Niemand
      heroTextOverlay.classList.toggle('show', showOverlay);
      heroTextOverlay.style.opacity = showOverlay ? '1' : '0';
    }
    if (heroText) {
      heroText.classList.toggle('hero-text-wir', idx === 3); // Wir 单独位置
    }
    // 自动切换关闭：防止和滚动阈值/手动阶段冲突导致重复
  }

  function updateTextFrame(progress) {
    if (!heroText || !heroTextImg) return;
    if (manualOverride) return; // 交给第2/3页逻辑控制
    if (!textUnlocked) {
      heroText.style.opacity = '0';
      return;
    }
    let idx = -1;
    for (let i = 0; i < textFrames.length; i++) {
      if (progress >= textFrames[i].from) idx = i;
    }
    // 自动阶段不回退，避免从后面帧跳回 besuche/jeder 造成重复
    if (!manualOverride && idx < currentTextFrame) {
      idx = currentTextFrame;
    }
    if (idx === currentTextFrame) return;
    setFrame(idx);
  }

  function page3Progress() {
    if (!page3) return 0;
    const rect = page3.getBoundingClientRect();
    const h = rect.height || window.innerHeight || 1;
    return clamp01(1 - (rect.bottom / h));
  }

  function page2Progress() {
    if (!page2) return 0;
    const rect = page2.getBoundingClientRect();
    const h = rect.height || window.innerHeight || 1;
    return clamp01((0 - rect.top) / h); // 顶部到达视口顶为0，离开一屏为1
  }

  function stopManualLoop() {
    if (manualLoop) {
      cancelAnimationFrame(manualLoop);
      manualLoop = null;
    }
  }

  function tickManualText() {
    if (!manualOverride) {
      stopManualLoop();
      return;
    }
    // 若 currentPageIndex 未切回 1/2，但页面可视度显示我们确实在 page2/3，上拉时也能显示气泡
    let manualIdx = currentPageIndex;
    if (manualIdx !== 1 && manualIdx !== 2) {
      if (isVisibleEnough(page2, 0.28)) manualIdx = 1;
      else if (isVisibleEnough(page3, 0.28)) manualIdx = 2;
    }

    if (manualIdx === 1) {
      const p = page2Progress();
      if (!textReady) {
        setFrame(-1);
      } else if (p < 0.005) {
        setFrame(0); // 仅在前 0.5% 显示 besuche，更早切到 jeder
      } else {
        setFrame(1); // 其余均显示 jeder，持续到进入第3页
      }
    } else if (manualIdx === 2) {
      const p = page3Progress();
      if (!textReady) {
        setFrame(-1);
      } else if (p < 0.05) {
        setFrame(1); // 第3页前 5% 保持 jeder，再切换
      } else {
        setFrame(3); // 第3页显示 Wir
      }
    } else {
      setFrame(-1);
    }
    manualLoop = requestAnimationFrame(tickManualText);
  }

  // 在回到第2/3页并滚动时，如果文案尚未解锁，则直接解锁，保证 besuche/jeder 出现
  unlockOnScroll = () => {
    if (textUnlocked) return;
    if (!heroStarted) return;
    const onP2 = currentPageIndex === 1 || isVisibleEnough(page2, 0.25);
    const onP3 = currentPageIndex === 2 || isVisibleEnough(page3, 0.25);
    if (onP2 || onP3) {
      textReady = true;
      textUnlocked = true;
      manualOverride = true;
      if (manualOverride && !manualLoop) {
        tickManualText();
      }
    }
  };

  // 根据可视度直接进入手动模式并更新文案，避免 pagechange 未触发时缺失气泡
  ensureManualByVisibility = () => {
    const p2Visible = isVisibleEnough(page2, 0.18);
    const p3Visible = isVisibleEnough(page3, 0.18);
    if (!p2Visible && !p3Visible) return;
    manualOverride = true;
    textReady = true;
    textUnlocked = true;
    if (!manualLoop) {
      tickManualText();
    }
  };

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
      syncTextPosition(x, baseY);
      updateTextFrame(0);
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
    if (heroText) {
      heroText.style.opacity = '0';
    }
    currentTextFrame = -1;
    requestAnimationFrame(step);
  }

  function deactivate() {
    running = false;
    hero.style.opacity = '0';
    if (heroText) heroText.style.opacity = '0';
    currentTextFrame = -1;
    manualOverride = false;
    stopManualLoop();
  }

  window.addEventListener('hero-start', () => {
    activate();
    if (heroTextTimer) {
      clearTimeout(heroTextTimer);
      heroTextTimer = null;
    }
    textReady = false;
    textUnlocked = false;
    heroTextTimer = setTimeout(() => {
      textReady = true;
      textUnlocked = true;
      if (manualOverride && !manualLoop) {
        tickManualText();
      }
    }, 1200); // 触发 hero 1.2 秒后才允许 besuche
  });
  window.addEventListener('pagechange', e => {
    if (e.detail.index === 1) {
      manualOverride = true;
      stopManualLoop();
      tickManualText();
    } else if (e.detail.index === 2) {
      manualOverride = true;
      stopManualLoop();
      tickManualText(); // 在第3页滚动中切换 besuche -> jeder
    } else if (e.detail.index === 3) {
      manualOverride = false; // 第4页进入正常时间轴
      stopManualLoop();
      updateTextFrame(page4Progress());
    } else {
      manualOverride = false;
      stopManualLoop();
      setFrame(-1);
    }
  });
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

/* === 最后一页：点击（手或点击图标）切换 Yiyun 文本 === */
document.addEventListener('DOMContentLoaded', () => {
  const target = document.getElementById('page7Yiyun');
  const icon = document.getElementById('clickIconFinal');
  const handWrap = document.querySelector('#page7 .handflower-wrap');
  const toggle = () => {
    if (!target) return;
    const willShow = !target.classList.contains('show');
    target.classList.toggle('show', willShow);
    target.style.opacity = willShow ? '1' : '0';
    target.style.display = 'block'; // 保持占位，避免切换失效
  };
  const bind = el => {
    if (!el) return;
    el.addEventListener('click', e => {
      e.stopPropagation(); // 避免冒泡导致双触发
      toggle();
    });
  };
  bind(icon);      // 点击提示图标
  bind(handWrap);  // 整个手区域（含手图）
});

/* 全局静音/开音量开关 */
(function initVolumeToggle() {
  const btn = document.getElementById('volumeToggle');
  if (!btn) return;
  const audios = Array.from(document.querySelectorAll('audio'));
  const videos = Array.from(document.querySelectorAll('video'));
  // 确保视频保持静音，避免自动播放被拦截
  videos.forEach(v => v.muted = true);
  let muted = true; // 初始显示静音，点击后开启

  function applyMuted() {
    audioMuted = muted;
    audios.forEach(a => {
      a.muted = muted;
      if (!muted && a.volume === 0) a.volume = 1;
    });
    // 视频始终保持静音
    videos.forEach(v => v.muted = true);
    btn.classList.toggle('muted', muted);
    btn.textContent = muted ? '🔇' : '🔊';
    btn.setAttribute('aria-label', muted ? '静音' : '开音量');
    btn.setAttribute('aria-pressed', (!muted).toString());
  }

  btn.addEventListener('click', () => {
    // 第一次点击 = 关声音；再次点击恢复
    muted = !muted;
    applyMuted();
    if (!muted) {
      // 重新开声：按当前页规则恢复各自播放
      playPageAudio(currentPageIndex);
      requestKinderPlay();
      ensureSheepPlaybackIfNeeded();
      ensureNoicePlaybackIfNeeded();
      ensureBirdPlaybackIfNeeded();
    } else {
      // 关闭声音：停止并清空播放意愿
      fadeOutKinder(true);
      sheepShouldPlay = false;
      stopSheepAudio();
      noiceShouldPlay = false;
      stopNoiceAudio();
      birdShouldPlay = false;
      stopBirdAudio();
    }
  });

  applyMuted();
})();

// 如果因浏览器策略阻止播放，等待下一次用户交互再尝试
function tryPlayPendingKinder() {
  if (!kinderAudio || !kinderPlayPending || !kinderShouldPlay) return;
  startKinderAudio();
}
['pointerdown', 'keydown', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, () => {
    kickstartAllAudio();
    tryPlayPendingKinder();
    tryPlayPendingBird();
    ensureSheepPlaybackIfNeeded();
    ensureNoicePlaybackIfNeeded();
    ensureBirdPlaybackIfNeeded();
    if (!firstInteractionBound) {
      firstInteractionBound = true;
      // 首次交互：按当前页规则尝试播放
      playPageAudio(currentPageIndex);
      requestKinderPlay();
      ensureSheepPlaybackIfNeeded();
      ensureNoicePlaybackIfNeeded();
      ensureBirdPlaybackIfNeeded();
    }
  }, { passive: true });
});
window.addEventListener('wheel', () => {
  kickstartAllAudio();
  tryPlayPendingKinder();
  tryPlayPendingBird();
  ensureSheepPlaybackIfNeeded();
  ensureNoicePlaybackIfNeeded();
  ensureBirdPlaybackIfNeeded();
}, { passive: true });

/* 第6页：pole 显隐（按页） */
(function initPoleOnPage6() {
  const pole  = document.getElementById('poleImg');
  const wrap  = pole ? pole.closest('.pole-wrap') : null;
  if (!pole) return;
  let timer = null;
  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const toggle = active => {
    clearTimer();
    if (active) {
      // 延迟触发出现，sticky 保持在视口
      timer = setTimeout(() => {
        pole.classList.add('visible');
        if (wrap) wrap.classList.add('sticky');
      }, 600);
    } else {
      pole.classList.remove('visible');
      if (wrap) wrap.classList.remove('sticky');
    }
  };
  window.addEventListener('pagechange', e => {
    const idx = e.detail.index;
    // 第3/4页以及向下进入第5页开头都保持显示，hero 下拉时不消失
    const shouldShow = idx >= 2 && idx <= 4;
    toggle(shouldShow);
  });
  toggle(currentPageIndex >= 2 && currentPageIndex <= 4);
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
