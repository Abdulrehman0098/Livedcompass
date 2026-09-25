/* ============================================================
   LIVE COMPASS — app.js
   All calculations are local. No external data transmission.
   ============================================================ */

(function () {
  'use strict';

  // ----------------------------------------------------------
  // STATE
  // ----------------------------------------------------------
  const state = {
    // Heading in degrees (0 = North)
    heading: null,
    // Pitch / Roll
    pitch: 0,
    roll: 0,
    // GPS
    lat: null,
    lon: null,
    altitude: null,
    accuracy: null,
    speed: null,
    // Unit preference: 'metric' | 'imperial'
    units: 'metric',
    // Theme: 'dark' | 'light'
    theme: 'dark',
    // Permission status
    compassPermission: 'pending', // pending | granted | denied | unsupported
    gpsPermission: 'pending',     // pending | granted | denied | unsupported
    // Waypoint
    waypoint: null, // { lat, lon }
    // Watch IDs
    gpsWatchId: null,
    orientationHandler: null,
  };

  // ----------------------------------------------------------
  // DOM REFS
  // ----------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ----------------------------------------------------------
  // CLOCK UPDATE TIMER
  // ----------------------------------------------------------
  let clockTimer = null;

  // ----------------------------------------------------------
  // INITIALIZATION
  // ----------------------------------------------------------
  function init() {
    applySavedTheme();
    buildCompassTicks();
    buildCompassLabels();
    updateYear();
    bindEvents();
    updateThemeLabel();
    startClock();
    // Check if sensors are available
    detectSensors();
  }

  // ----------------------------------------------------------
  // YEAR IN FOOTER
  // ----------------------------------------------------------
  function updateYear() {
    const el = document.getElementById('year');
    if (el) el.textContent = new Date().getFullYear();
  }

  // ----------------------------------------------------------
  // SENSOR AVAILABILITY DETECTION
  // ----------------------------------------------------------
  function detectSensors() {
    // Check orientation
    if (!('DeviceOrientationEvent' in window)) {
      setCompassStatus('unsupported');
    }
    // Check geolocation
    if (!('geolocation' in navigator)) {
      setGpsStatus('unsupported');
    }
  }

  // ----------------------------------------------------------
  // THEME
  // ----------------------------------------------------------
  function applySavedTheme() {
    const saved = localStorage.getItem('livecompass-theme');
    if (saved === 'light' || saved === 'dark') {
      state.theme = saved;
    } else {
      // default to dark
      state.theme = 'dark';
    }
    document.documentElement.setAttribute('data-theme', state.theme);
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('livecompass-theme', state.theme);
    updateThemeLabel();
  }

  function updateThemeLabel() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const label = btn.querySelector('.theme-label');
    if (label) label.textContent = state.theme === 'dark' ? 'Dark' : 'Light';
  }

  // ----------------------------------------------------------
  // COMPASS DIAL — TICKS & LABELS (SVG)
  // ----------------------------------------------------------
  function buildCompassTicks() {
    const ticksGroup = document.getElementById('compass-ticks');
    if (!ticksGroup) return;
    let svg = '';
    for (let deg = 0; deg < 360; deg += 5) {
      const rad = (deg - 90) * Math.PI / 180;
      const isMajor = deg % 30 === 0;
      const isIntercardinal = deg % 90 !== 0 && deg % 45 === 0;
      const r1 = 140;
      const r2 = isMajor ? 128 : (isIntercardinal ? 133 : 136);
      const x1 = 160 + r1 * Math.cos(rad);
      const y1 = 160 + r1 * Math.sin(rad);
      const x2 = 160 + r2 * Math.cos(rad);
      const y2 = 160 + r2 * Math.sin(rad);
      const width = isMajor ? 1.5 : 0.7;
      const opacity = isMajor ? 0.9 : (isIntercardinal ? 0.6 : 0.35);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--brass)" stroke-width="${width}" opacity="${opacity}"/>`;
    }
    ticksGroup.innerHTML = svg;
  }

  function buildCompassLabels() {
    const labelsGroup = document.getElementById('compass-labels');
    if (!labelsGroup) return;
    const cardinals = [
      { deg: 0, label: 'N' },
      { deg: 90, label: 'E' },
      { deg: 180, label: 'S' },
      { deg: 270, label: 'W' },
    ];
    const intercardinals = [
      { deg: 45, label: 'NE' },
      { deg: 135, label: 'SE' },
      { deg: 225, label: 'SW' },
      { deg: 315, label: 'NW' },
    ];
    let svg = '';
    // Cardinal labels
    cardinals.forEach(({ deg, label }) => {
      const rad = (deg - 90) * Math.PI / 180;
      const r = 112;
      const x = 160 + r * Math.cos(rad);
      const y = 160 + r * Math.sin(rad);
      svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="var(--brass-light)" font-size="14" font-family="var(--sans)" font-weight="600">${label}</text>`;
    });
    // Intercardinal labels
    intercardinals.forEach(({ deg, label }) => {
      const rad = (deg - 90) * Math.PI / 180;
      const r = 112;
      const x = 160 + r * Math.cos(rad);
      const y = 160 + r * Math.sin(rad);
      svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="var(--brass-dim)" font-size="10" font-family="var(--sans)" font-weight="500">${label}</text>`;
    });
    // Degree numbers at major ticks
    for (let deg = 30; deg < 360; deg += 30) {
      const rad = (deg - 90) * Math.PI / 180;
      const r = 100;
      const x = 160 + r * Math.cos(rad);
      const y = 160 + r * Math.sin(rad);
      svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" fill="var(--fg-dim)" font-size="8" font-family="var(--sans)">${deg}°</text>`;
    }
    labelsGroup.innerHTML = svg;
  }

  // ----------------------------------------------------------
  // COMPASS NEEDLE ROTATION
  // ----------------------------------------------------------
  function rotateNeedle(heading) {
    const needle = document.getElementById('compass-needle');
    if (!needle) return;
    needle.style.transform = `rotate(${heading}deg)`;
    needle.style.transformOrigin = '160px 160px';
    needle.style.transition = 'transform 0.15s ease-out';
  }

  // ----------------------------------------------------------
  // CARDINAL TEXT
  // ----------------------------------------------------------
  function cardinalFromHeading(heading) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(heading / 45) % 8;
    return dirs[index];
  }

  // ----------------------------------------------------------
  // COMPASS STATUS DISPLAY
  // ----------------------------------------------------------
  function setCompassStatus(status) {
    const statusEl = document.getElementById('compass-status');
    if (!statusEl) return;
    const messages = {
      pending: 'Not yet activated',
      granted: 'Compass active',
      denied: 'Permission denied — compass unavailable',
      unsupported: 'No orientation sensor detected — showing fixed North-up display',
    };
    statusEl.textContent = messages[status] || '';
    statusEl.className = 'status-msg' + (status === 'denied' ? ' error' : (status === 'granted' ? ' success' : ''));
    state.compassPermission = status;
  }

  // ----------------------------------------------------------
  // COMPASS — ENABLE (handles iOS permission)
  // ----------------------------------------------------------
  async function enableCompass() {
    // iOS 13+ requires user-gesture permission request
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        const perm = await DOE.requestPermission();
        if (perm === 'granted') {
          attachOrientationListener();
          setCompassStatus('granted');
        } else {
          setCompassStatus('denied');
          freezeCompassNorth();
        }
      } catch (err) {
        console.warn('Compass permission error:', err);
        setCompassStatus('denied');
        freezeCompassNorth();
      }
    } else if (DOE) {
      // Non-iOS or older iOS — attach directly
      attachOrientationListener();
      setCompassStatus('granted');
    } else {
      setCompassStatus('unsupported');
      freezeCompassNorth();
    }
  }

  function attachOrientationListener() {
    if (state.orientationHandler) return; // already attached
    state.orientationHandler = onOrientation;
    window.addEventListener('deviceorientation', state.orientationHandler, true);
    // Also attach for tilt
    window.addEventListener('deviceorientationabsolute', state.orientationHandler, true);
  }

  // ----------------------------------------------------------
  // ORIENTATION EVENT HANDLER
  // ----------------------------------------------------------
  function onOrientation(event) {
    // Alpha = compass heading (0-360)
    let alpha = null;
    if (typeof event.absolute === 'boolean' && event.absolute && event.alpha != null) {
      alpha = event.alpha;
    } else if (event.webkitCompassHeading != null) {
      alpha = event.webkitCompassHeading;
    } else if (event.alpha != null) {
      alpha = event.alpha;
    }
    if (alpha != null) {
      state.heading = alpha;
      const displayHeading = Math.round(alpha);
      updateHeadingReadout(displayHeading);
      rotateNeedle(displayHeading);
    }
    // Beta = front-back tilt (-180 to 180), gamma = left-right (-90 to 90)
    if (event.beta != null) state.pitch = event.beta;
    if (event.gamma != null) state.roll = event.gamma;
    updateTiltDisplay();
    updateCelestialMarkers();
  }

  function updateHeadingReadout(heading) {
    const degEl = document.getElementById('heading-deg');
    const cardEl = document.getElementById('heading-card');
    if (degEl) degEl.textContent = String(heading).padStart(3, '0') + '°';
    if (cardEl) cardEl.textContent = cardinalFromHeading(heading);
  }

  function freezeCompassNorth() {
    rotateNeedle(0);
    updateHeadingReadout(0);
  }

  // ----------------------------------------------------------
  // TILT METER
  // ----------------------------------------------------------
  function updateTiltDisplay() {
    const pitch = state.pitch;
    const roll = state.roll;
    // Slope = magnitude of tilt from vertical
    const slope = Math.sqrt(pitch * pitch + roll * roll);

    const pitchEl = document.getElementById('pitch-val');
    const rollEl = document.getElementById('roll-val');
    const slopeEl = document.getElementById('slope-val');
    if (pitchEl) pitchEl.textContent = pitch.toFixed(1) + '°';
    if (rollEl) rollEl.textContent = roll.toFixed(1) + '°';
    if (slopeEl) slopeEl.textContent = slope.toFixed(1) + '°';

    // Move bubble
    const bubble = document.getElementById('tilt-bubble');
    if (bubble) {
      // Map pitch/roll to x/y. gamma = roll = x-axis (-90 to 90), beta = pitch = y-axis (-180 to 180)
      // Clamp to gauge radius
      const maxOffset = 75; // pixels in SVG units
      const xOffset = Math.max(-maxOffset, Math.min(maxOffset, roll * (maxOffset / 90)));
      const yOffset = Math.max(-maxOffset, Math.min(maxOffset, pitch * (maxOffset / 180)));
      bubble.setAttribute('cx', 100 + xOffset);
      bubble.setAttribute('cy', 100 + yOffset);
    }

    const tiltStatus = document.getElementById('tilt-status');
    if (tiltStatus) {
      if (state.compassPermission === 'granted') {
        tiltStatus.textContent = 'Tilt sensor active';
        tiltStatus.className = 'status-msg success';
      } else if (state.compassPermission === 'unsupported') {
        tiltStatus.textContent = 'No tilt sensor detected';
        tiltStatus.className = 'status-msg';
      }
    }
  }

  // ----------------------------------------------------------
  // GPS
  // ----------------------------------------------------------
  function setGpsStatus(status) {
    const statusEl = document.getElementById('gps-status');
    if (!statusEl) return;
    const messages = {
      pending: 'Not yet activated',
      granted: 'Location active',
      denied: 'Location permission denied',
      unsupported: 'Geolocation not supported on this device',
    };
    statusEl.textContent = messages[status] || '';
    statusEl.className = 'status-msg' + (status === 'denied' ? ' error' : (status === 'granted' ? ' success' : ''));
    state.gpsPermission = status;
  }

  function enableGps() {
    if (!('geolocation' in navigator)) {
      setGpsStatus('unsupported');
      return;
    }
    state.gpsWatchId = navigator.geolocation.watchPosition(
      onGpsSuccess,
      onGpsError,
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  function onGpsSuccess(pos) {
    state.lat = pos.coords.latitude;
    state.lon = pos.coords.longitude;
    state.altitude = pos.coords.altitude;
    state.accuracy = pos.coords.accuracy;
    state.speed = pos.coords.speed;
    setGpsStatus('granted');
    updateGpsDisplay();
    updateCelestialData();
  }

  function onGpsError(err) {
    let status = 'denied';
    if (err.code === err.POSITION_UNAVAILABLE) {
      status = 'denied';
      const el = document.getElementById('gps-status');
      if (el) {
        el.textContent = 'GPS position unavailable — move to an area with clear sky view';
        el.className = 'status-msg error';
      }
    } else if (err.code === err.TIMEOUT) {
      const el = document.getElementById('gps-status');
      if (el) {
        el.textContent = 'GPS request timed out — retrying...';
        el.className = 'status-msg';
      }
      return; // watchPosition will retry
    }
    setGpsStatus(status);
  }

  // ----------------------------------------------------------
  // UNIT CONVERSIONS
  // ----------------------------------------------------------
  function metersToFeet(m) { return m * 3.28084; }
  function msToKmh(ms) { return ms * 3.6; }
  function msToMph(ms) { return ms * 2.23694; }
  function kmToMi(km) { return km * 0.621371; }
  function mToFt(m) { return m * 3.28084; }

  function formatAltitude(m) {
    if (m == null) return '—';
    return state.units === 'metric'
      ? `${m.toFixed(0)} m`
      : `${metersToFeet(m).toFixed(0)} ft`;
  }
  function formatAccuracy(m) {
    if (m == null) return '—';
    return state.units === 'metric'
      ? `${m.toFixed(0)} m`
      : `${metersToFeet(m).toFixed(0)} ft`;
  }
  function formatSpeed(ms) {
    if (ms == null) return '—';
    return state.units === 'metric'
      ? `${msToKmh(ms).toFixed(1)} km/h`
      : `${msToMph(ms).toFixed(1)} mph`;
  }
  function formatDistance(km) {
    if (state.units === 'metric') {
      return km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(2)} km`;
    } else {
      const mi = kmToMi(km);
      return mi < 0.1 ? `${(mi * 5280).toFixed(0)} ft` : `${mi.toFixed(2)} mi`;
    }
  }

  function updateGpsDisplay() {
    const latEl = document.getElementById('gps-lat');
    const lonEl = document.getElementById('gps-lon');
    const altEl = document.getElementById('gps-alt');
    const accEl = document.getElementById('gps-acc');
    const speedEl = document.getElementById('gps-speed');
    if (latEl) latEl.textContent = state.lat != null ? state.lat.toFixed(6) : '—';
    if (lonEl) lonEl.textContent = state.lon != null ? state.lon.toFixed(6) : '—';
    if (altEl) altEl.textContent = formatAltitude(state.altitude);
    if (accEl) accEl.textContent = formatAccuracy(state.accuracy);
    if (speedEl) speedEl.textContent = formatSpeed(state.speed);

    // Update distance if waypoint exists
    if (state.waypoint && state.lat != null) {
      updateDistanceAndBearing();
    }
    // Update celestial markers position
    updateCelestialMarkers();
  }

  // ----------------------------------------------------------
  // UNIT TOGGLE
  // ----------------------------------------------------------
  function toggleUnits() {
    state.units = state.units === 'metric' ? 'imperial' : 'metric';
    const label = document.getElementById('unit-label');
    if (label) label.textContent = state.units === 'metric' ? 'Metric' : 'Imperial';
    // Re-render all displays
    updateGpsDisplay();
    if (state.waypoint && state.lat != null) {
      updateDistanceAndBearing();
    }
    // Update celestial distance (none yet) and other measured values
  }

  // ----------------------------------------------------------
  // COPY COORDINATES
  // ----------------------------------------------------------
  async function copyCoordinates() {
    if (state.lat == null || state.lon == null) {
      showCopyFeedback('No coordinates to copy', false);
      return;
    }
    const text = `${state.lat.toFixed(6)}, ${state.lon.toFixed(6)}`;
    let success = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        success = true;
      } else {
        // Fallback: temporary textarea
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        success = true;
      }
    } catch (err) {
      console.warn('Clipboard write failed:', err);
      success = false;
    }
    showCopyFeedback(success ? 'Coordinates copied!' : 'Copy failed', success);
  }

  function showCopyFeedback(msg, success) {
    const el = document.getElementById('copy-feedback');
    if (!el) return;
    el.textContent = msg;
    el.style.color = success ? 'var(--brass)' : '#e05555';
    setTimeout(() => { el.textContent = ''; }, 3000);
  }

  // ----------------------------------------------------------
  // DISTANCE & BEARING (Haversine + initial bearing)
  // ----------------------------------------------------------
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function initialBearing(lat1, lon1, lat2, lon2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function toRad(d) { return d * Math.PI / 180; }
  function toDeg(r) { return r * 180 / Math.PI; }

  function plotCourse() {
    if (state.lat == null || state.lon == null) {
      const navStatus = document.getElementById('nav-status');
      if (navStatus) {
        navStatus.textContent = 'Enable location first';
        navStatus.className = 'status-msg error';
      }
      return;
    }
    const latInput = document.getElementById('target-lat');
    const lonInput = document.getElementById('target-lon');
    const lat2 = parseFloat(latInput.value);
    const lon2 = parseFloat(lonInput.value);
    if (isNaN(lat2) || isNaN(lon2) || lat2 < -90 || lat2 > 90 || lon2 < -180 || lon2 > 180) {
      const navStatus = document.getElementById('nav-status');
      if (navStatus) {
        navStatus.textContent = 'Invalid coordinates';
        navStatus.className = 'status-msg error';
      }
      return;
    }
    state.waypoint = { lat: lat2, lon: lon2 };
    updateDistanceAndBearing();
    plotWaypointOnDial();
    const navStatus = document.getElementById('nav-status');
    if (navStatus) {
      navStatus.textContent = '';
      navStatus.className = 'status-msg';
    }
  }

  function updateDistanceAndBearing() {
    if (!state.waypoint || state.lat == null) return;
    const dist = haversine(state.lat, state.lon, state.waypoint.lat, state.waypoint.lon);
    const bearing = initialBearing(state.lat, state.lon, state.waypoint.lat, state.waypoint.lon);
    const distEl = document.getElementById('nav-dist');
    const bearEl = document.getElementById('nav-bearing');
    const resultsEl = document.getElementById('nav-results');
    if (distEl) distEl.textContent = formatDistance(dist);
    if (bearEl) bearEl.textContent = `${Math.round(bearing)}° (${cardinalFromHeading(bearing)})`;
    if (resultsEl) resultsEl.style.display = 'flex';
  }

  function plotWaypointOnDial() {
    const marker = document.getElementById('waypoint-marker');
    if (!marker || !state.waypoint || state.lat == null) return;
    const bearing = initialBearing(state.lat, state.lon, state.waypoint.lat, state.waypoint.lon);
    // Rotate marker group around center (160,160)
    const angle = bearing - 90; // SVG rotation
    const r = 120;
    const rad = angle * Math.PI / 180;
    const cx = 160 + r * Math.cos(rad);
    const cy = 160 + r * Math.sin(rad);
    const circle = marker.querySelector('circle');
    const text = marker.querySelector('text');
    if (circle) {
      circle.setAttribute('cx', cx);
      circle.setAttribute('cy', cy);
    }
    if (text) {
      text.setAttribute('x', cx);
      text.setAttribute('y', cy - 12);
    }
    marker.style.display = 'block';
  }

  function clearWaypoint() {
    state.waypoint = null;
    const marker = document.getElementById('waypoint-marker');
    if (marker) marker.style.display = 'none';
    const resultsEl = document.getElementById('nav-results');
    if (resultsEl) resultsEl.style.display = 'none';
    const navStatus = document.getElementById('nav-status');
    if (navStatus) {
      navStatus.textContent = 'Waypoint cleared';
      navStatus.className = 'status-msg';
    }
  }

  // ----------------------------------------------------------
  // SUN & MOON POSITION (SunCalc)
  // ----------------------------------------------------------
  function updateCelestialData() {
    if (state.lat == null || state.lon == null) return;
    const now = new Date();
    const pos = SunCalc.getPosition(now, state.lat, state.lon);
    const times = SunCalc.getTimes(now, state.lat, state.lon);
    const moonPos = SunCalc.getMoonPosition(now, state.lat, state.lon);
    const moonIllum = SunCalc.getMoonIllumination(now);
    const moonTimes = SunCalc.getMoonTimes(now, state.lat, state.lon);

    // Sun azimuth (from SunCalc: radians, 0 = South, positive = clockwise... actually 0 = S, PI/2 = W, etc)
    // Convert: SunCalc azimuth is measured from south, increasing clockwise. Convert to degrees from north clockwise.
    let sunAz = toDeg(pos.azimuth) + 180;
    if (sunAz >= 360) sunAz -= 360;
    const sunEl = toDeg(pos.altitude);

    let moonAz = toDeg(moonPos.azimuth) + 180;
    if (moonAz >= 360) moonAz -= 360;
    const moonEl = toDeg(moonPos.altitude);

    // Display
    setText('sun-az', `${sunAz.toFixed(1)}°`);
    setText('sun-el', `${sunEl.toFixed(1)}°`);
    setText('moon-az', `${moonAz.toFixed(1)}°`);
    setText('moon-el', `${moonEl.toFixed(1)}°`);

    // Sun times
    setText('sunrise', formatTime(times.sunrise));
    setText('sunset', formatTime(times.sunset));
    setText('solar-noon', formatTime(times.solarNoon));

    // Moon times
    setText('moonrise', formatTime(moonTimes.rise));
    setText('moonset', formatTime(moonTimes.set));
    setText('moon-phase', moonPhaseName(moonIllum.phase));
    setText('moon-illum', `${(moonIllum.fraction * 100).toFixed(1)}%`);

    // Edge cases for sun
    if (times.sunrise == null && times.sunset == null) {
      // Check if polar day or night — SunCalc returns those as properties
      if (times.alwaysUp) {
        setText('sunrise', 'Always up (polar day)');
        setText('sunset', '—');
      } else if (times.alwaysDown) {
        setText('sunrise', '—');
        setText('sunset', 'Always down (polar night)');
      }
    } else {
      if (times.sunrise == null) setText('sunrise', '—');
      if (times.sunset == null) setText('sunset', '—');
    }
    if (!times.solarNoon) setText('solar-noon', '—');

    // Moon edge cases
    if (!moonTimes.rise && !moonTimes.set) {
      if (moonTimes.alwaysUp) {
        setText('moonrise', 'Always up');
        setText('moonset', '—');
      } else if (moonTimes.alwaysDown) {
        setText('moonrise', '—');
        setText('moonset', 'Always down');
      }
    } else {
      if (!moonTimes.rise) setText('moonrise', '—');
      if (!moonTimes.set) setText('moonset', '—');
    }

    // Markers on compass dial
    updateCelestialMarkers(sunAz, moonAz);
  }

  function moonPhaseName(phase) {
    // phase: 0 = new moon, 0.5 = full moon, 1 = new moon
    if (phase < 0.03 || phase > 0.97) return 'New Moon';
    if (phase < 0.22) return 'Waxing Crescent';
    if (phase < 0.28) return 'First Quarter';
    if (phase < 0.47) return 'Waxing Gibbous';
    if (phase < 0.53) return 'Full Moon';
    if (phase < 0.72) return 'Waning Gibbous';
    if (phase < 0.78) return 'Last Quarter';
    return 'Waning Crescent';
  }

  function formatTime(date) {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '—';
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ----------------------------------------------------------
  // CELESTIAL MARKERS ON COMPASS DIAL
  // ----------------------------------------------------------
  function updateCelestialMarkers(sunAz, moonAz) {
    const container = document.getElementById('celestial-markers');
    if (!container) return;
    if (state.lat == null || state.lon == null) {
      container.innerHTML = '';
      return;
    }
    if (sunAz == null || moonAz == null) {
      // Recompute if needed
      const now = new Date();
      const pos = SunCalc.getPosition(now, state.lat, state.lon);
      const moonPos = SunCalc.getMoonPosition(now, state.lat, state.lon);
      sunAz = toDeg(pos.azimuth) + 180;
      moonAz = toDeg(moonPos.azimuth) + 180;
      if (sunAz >= 360) sunAz -= 360;
      if (moonAz >= 360) moonAz -= 360;
    }
    // Plot markers at radius 100 on dial
    const r = 100;
    let svg = '';

    // Sun marker (gold circle)
    const sunRad = (sunAz - 90) * Math.PI / 180;
    const sunX = 160 + r * Math.cos(sunRad);
    const sunY = 160 + r * Math.sin(sunRad);
    svg += `<circle cx="${sunX}" cy="${sunY}" r="5" fill="#ffd449" stroke="var(--brass)" stroke-width="0.5" opacity="0.9"/>`;

    // Moon marker (silver circle)
    const moonRad = (moonAz - 90) * Math.PI / 180;
    const moonX = 160 + r * Math.cos(moonRad);
    const moonY = 160 + r * Math.sin(moonRad);
    svg += `<circle cx="${moonX}" cy="${moonY}" r="4" fill="#c0c8d8" stroke="var(--brass-dim)" stroke-width="0.5" opacity="0.9"/>`;

    container.innerHTML = svg;
  }

  // ----------------------------------------------------------
  // CLOCK — update celestial data every 30s
  // ----------------------------------------------------------
  function startClock() {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      if (state.lat != null && state.lon != null) {
        updateCelestialData();
      }
    }, 30000);
  }

  // ----------------------------------------------------------
  // FAQ ACCORDION
  // ----------------------------------------------------------
  function setupFAQ() {
    const buttons = document.querySelectorAll('.faq-question');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        const answer = document.getElementById(btn.getAttribute('aria-controls'));
        btn.setAttribute('aria-expanded', String(!expanded));
        if (answer) {
          if (expanded) {
            answer.setAttribute('aria-hidden', 'true');
            answer.style.maxHeight = '0';
            answer.style.paddingTop = '0';
            answer.style.paddingBottom = '0';
          } else {
            answer.setAttribute('aria-hidden', 'false');
            answer.style.maxHeight = answer.scrollHeight + 20 + 'px';
          }
        }
      });
    });
  }

  // ----------------------------------------------------------
  // BIND EVENTS
  // ----------------------------------------------------------
  function bindEvents() {
    const enableCompassBtn = document.getElementById('enable-compass');
    if (enableCompassBtn) enableCompassBtn.addEventListener('click', enableCompass);

    const enableGpsBtn = document.getElementById('enable-gps');
    if (enableGpsBtn) enableGpsBtn.addEventListener('click', enableGps);

    const unitBtn = document.getElementById('unit-toggle');
    if (unitBtn) unitBtn.addEventListener('click', toggleUnits);

    const copyBtn = document.getElementById('copy-coords');
    if (copyBtn) copyBtn.addEventListener('click', copyCoordinates);

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const plotBtn = document.getElementById('plot-course');
    if (plotBtn) plotBtn.addEventListener('click', plotCourse);

    const clearBtn = document.getElementById('clear-waypoint');
    if (clearBtn) clearBtn.addEventListener('click', clearWaypoint);

    // FAQ
    setupFAQ();
  }

  // ----------------------------------------------------------
  // BOOT
  // ----------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
