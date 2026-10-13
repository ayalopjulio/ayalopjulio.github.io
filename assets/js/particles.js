(function () {
  var canvas = document.querySelector('.masthead-particles');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Settings ----
  var LEFT_COLOR  = '#2457C5';
  var RIGHT_COLOR = '#1FA86A';
  var COUNT = 100;
  var RADIUS_FRACTION = 0.02;   // blob radius as a fraction of the canvas width
  var MIN_RADIUS = 12;          // never smaller than this (px), so phones still look good
  var MAX_RADIUS = 50;          // never larger than this (px), so big monitors don't get giant blobs
  var INTERACT_FACTOR = 1.5;    // color-exchange distance, as a multiple of the radius
  var ALPHA = 0.85;             // same for every blob
  var SPEED = 0.03;             // base speed, as a fraction of canvas width per second
  var SPEED_VARIATION = 0.015;  // random extra speed per blob
  var SCATTER = 0.5;            // width of the central zone (fraction of canvas width)
                                // where blobs choose a random direction
  var INTERACT_RADIUS = 45;     // blobs closer than this (px) exchange color
  var MIX_RATE = 1;             // how fast colors average out on contact
  var VERT_SPEED = 20;          // max vertical speed (px per second)
  var VERT_CHANGE = 90;         // how quickly vertical direction changes (higher = more curvy paths)

  // blob shape
  var POINTS = 10;              // points on each outline (more = more detailed shape)
  var WOBBLE = 0.3;             // how far the outline deviates from a circle (fraction of RADIUS)
  var WOBBLE_SPEED = 2.2;       // how fast shapes morph
  var SPIN = 1.0;               // max rotation speed (radians per second)

  //Cursor
  var CURSOR_COLOR = '#1BA799'; // pointer color
  var CURSOR_ALPHA = 0.9;
  var CURSOR_SCALE = 1.2;       // pointer size relative to the particle radius
  var CURSOR_FOLLOW = 5;       // how quickly it follows the mouse (higher = snappier, lower = more trailing)

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  var left = hexToRgb(LEFT_COLOR);
  var right = hexToRgb(RIGHT_COLOR);

  var w = 0, h = 0, last = 0, clock = 0;
  var RADIUS = 30, INTERACT_RADIUS = 45;   // set properly in resize()
  var particles = [];

  // Cursor events
  var cursor = { x: 0, y: 0, tx: 0, ty: 0, rot: 0, active: false, phase: [], freq: [] };
  for (var c = 0; c < POINTS; c++) {
    cursor.phase.push(Math.random() * Math.PI * 2);
    cursor.freq.push(0.5 + Math.random());
  }

  window.addEventListener('pointermove', function (e) {
    cursor.cx = e.clientX;
    cursor.cy = e.clientY;
    if (!cursor.active) { cursor.snap = true; cursor.active = true; }
  });
  document.documentElement.addEventListener('mouseleave', function () { cursor.active = false; });

  function resize() {
    var oldW = w, oldH = h;
    var dpr = window.devicePixelRatio || 1;
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    RADIUS = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, w * RADIUS_FRACTION));
    INTERACT_RADIUS = RADIUS * INTERACT_FACTOR;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (oldW > 0 && oldH > 0) {
      for (var i = 0; i < particles.length; i++) {
        particles[i].x *= w / oldW;
        particles[i].turnX *= w / oldW;
        particles[i].y *= h / oldH;
      }
    }
  }

  // c is the color value: 0 = fully left color, 1 = fully right color
  function spawn(p, randomStart) {
    p.origin = Math.random() < 0.5 ? -1 : 1;      // -1 = enters from left, 1 = from right
    p.dir = -p.origin;                            // heading toward the center
    p.c = p.origin === -1 ? 0 : 1;
    p.speed = SPEED + Math.random() * SPEED_VARIATION;
    p.turnX = w / 2 + (Math.random() - 0.5) * SCATTER * w;
    p.turned = false;
    p.vy = (Math.random() - 0.5) * 2 * VERT_SPEED;
    p.y = RADIUS + Math.random() * Math.max(0, h - 2 * RADIUS);
    p.x = p.origin === -1 ? -RADIUS : w + RADIUS;

    // blob shape: each outline point wobbles with its own phase and frequency
    p.rot = Math.random() * Math.PI * 2;
    p.spin = (Math.random() - 0.5) * 2 * SPIN;
    p.phase = [];
    p.freq = [];
    for (var k = 0; k < POINTS; k++) {
      p.phase.push(Math.random() * Math.PI * 2);
      p.freq.push(0.5 + Math.random());
    }

    if (randomStart) {
      p.x = Math.random() * w;
      var passed = p.origin === -1 ? p.x >= p.turnX : p.x <= p.turnX;
      if (passed) {
        p.turned = true;
        p.dir = Math.random() < 0.5 ? -1 : 1;
        p.c = 0.5;
      }
    }
    return p;
  }

  function step(dt) {
    var i, j, p, q;

    clock += dt;

    if (cursor.active) {
      // convert viewport coordinates to canvas coordinates, wherever the canvas sits
      var rect = canvas.getBoundingClientRect();
      cursor.tx = cursor.cx - rect.left;
      cursor.ty = cursor.cy - rect.top;
      if (cursor.snap) { cursor.x = cursor.tx; cursor.y = cursor.ty; cursor.snap = false; }

      var k = 1 - Math.exp(-CURSOR_FOLLOW * dt);
      cursor.x += (cursor.tx - cursor.x) * k;
      cursor.y += (cursor.ty - cursor.y) * k;
      cursor.rot += 0.6 * dt;
    }

    // movement
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      p.x += p.dir * p.speed * w * dt;
      p.rot += p.spin * dt;

      // smooth vertical drift: velocity changes gradually, so paths are gentle diagonals
      p.vy += (Math.random() - 0.5) * 2 * VERT_CHANGE * Math.sqrt(dt);
      if (p.vy > VERT_SPEED) p.vy = VERT_SPEED;
      else if (p.vy < -VERT_SPEED) p.vy = -VERT_SPEED;
      p.y += p.vy * dt;

      // bounce off the top and bottom
      if (p.y < RADIUS) { p.y = RADIUS; p.vy = Math.abs(p.vy); }
      else if (p.y > h - RADIUS) { p.y = h - RADIUS; p.vy = -Math.abs(p.vy); }

      // reaching its turning point: pick a random direction, left or right
      if (!p.turned) {
        var reached = p.origin === -1 ? p.x >= p.turnX : p.x <= p.turnX;
        if (reached) {
          p.turned = true;
          p.dir = Math.random() < 0.5 ? -1 : 1;
        }
      }

      // left the canvas: replace with a fresh, pure-colored blob
      if (p.x < -RADIUS * 2 || p.x > w + RADIUS * 2) spawn(p, false);
    }

    // color spreading: close blobs pull each other toward their average
    var r2 = INTERACT_RADIUS * INTERACT_RADIUS;
    var f = Math.min(1, MIX_RATE * dt) / 2;
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      for (j = i + 1; j < particles.length; j++) {
        q = particles[j];
        var dx = p.x - q.x, dy = p.y - q.y;
        if (dx * dx + dy * dy < r2) {
          var d = (q.c - p.c) * f;
          p.c += d;
          q.c -= d;
        }
      }
    }
  }

  // builds a smooth closed outline whose radius wobbles around each point
  function blobPath(p, radius) {
    var n = POINTS, pts = [], k;
    for (k = 0; k < n; k++) {
      var a = p.rot + (k / n) * Math.PI * 2;
      //var rad = RADIUS * (1 + WOBBLE * Math.sin(clock * WOBBLE_SPEED * p.freq[k] + p.phase[k]));
      var rad = (radius || RADIUS) * (1 + WOBBLE * Math.sin(clock * WOBBLE_SPEED * p.freq[k] + p.phase[k]));
      pts.push([p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad]);
    }
    // quadratic curves through the midpoints between points give a smooth loop
    ctx.beginPath();
    ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
    for (k = 0; k < n; k++) {
      var next = pts[(k + 1) % n];
      ctx.quadraticCurveTo(
        pts[k][0], pts[k][1],
        (pts[k][0] + next[0]) / 2, (pts[k][1] + next[1]) / 2
      );
    }
    ctx.closePath();
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var r = Math.round(lerp(left[0], right[0], p.c));
      var g = Math.round(lerp(left[1], right[1], p.c));
      var b = Math.round(lerp(left[2], right[2], p.c));
      ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + ALPHA + ')';
      blobPath(p);
      ctx.fill();
    }
    if (cursor.active) {
      ctx.globalAlpha = CURSOR_ALPHA;
      ctx.fillStyle = CURSOR_COLOR;
      blobPath(cursor, RADIUS * CURSOR_SCALE);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function tick(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    step(dt);
    draw();
    requestAnimationFrame(tick);
  }

  resize();
  for (var i = 0; i < COUNT; i++) particles.push(spawn({}, true));
  window.addEventListener('resize', resize);

  // warm-up: simulate ~30 seconds so the first frame already looks mixed
  for (var k = 0; k < 900; k++) step(1 / 30);

  if (reduceMotion) {
    draw();
  } else {
    requestAnimationFrame(function (now) { last = now; tick(now); });
  }
})();