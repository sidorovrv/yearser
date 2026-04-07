// ============================================================
//  TIMELINE SLIDER — noUiSlider date range for filtering concerts
// ============================================================

let _timelineSlider = null;
let _timelineMinDate = null;
let _timelineMaxDate = null;

function initConcertTimeline(containerId, events) {
  const container = document.getElementById(containerId);
  if (!container || !events.length) return;

  // Extract date range from events
  const dates = events
    .map(ev => ev.date ? new Date(ev.date).getTime() : null)
    .filter(d => d && !isNaN(d));

  if (dates.length === 0) return;

  _timelineMinDate = new Date(Math.min(...dates));
  _timelineMaxDate = new Date(Math.max(...dates));

  // If all events on same day, extend range by 1 month each side
  if (_timelineMaxDate - _timelineMinDate < 86400000) {
    _timelineMinDate = new Date(_timelineMinDate.getTime() - 30 * 86400000);
    _timelineMaxDate = new Date(_timelineMaxDate.getTime() + 30 * 86400000);
  }

  const minTs = _timelineMinDate.getTime();
  const maxTs = _timelineMaxDate.getTime();

  _timelineSlider = noUiSlider.create(container, {
    start: [minTs, maxTs],
    connect: true,
    range: {
      min: minTs,
      max: maxTs
    },
    step: 86400000, // 1 day
    behaviour: 'drag-tap',
    tooltips: [
      { to: _tsToLabel },
      { to: _tsToLabel }
    ]
  });

  // Update labels
  _updateRangeLabels(minTs, maxTs);

  // Wire to map filter
  _timelineSlider.on('update', (values) => {
    const start = new Date(parseFloat(values[0]));
    const end = new Date(parseFloat(values[1]));
    _updateRangeLabels(parseFloat(values[0]), parseFloat(values[1]));
    filterByDates(start, end);
  });
}

function resetConcertTimeline() {
  if (_timelineSlider && _timelineMinDate && _timelineMaxDate) {
    _timelineSlider.set([_timelineMinDate.getTime(), _timelineMaxDate.getTime()]);
  }
}

function _tsToLabel(ts) {
  const d = new Date(ts);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function _updateRangeLabels(startTs, endTs) {
  const fromEl = document.getElementById('timeline-from');
  const toEl = document.getElementById('timeline-to');
  if (fromEl) fromEl.textContent = _tsToLabel(startTs);
  if (toEl) toEl.textContent = _tsToLabel(endTs);
}
