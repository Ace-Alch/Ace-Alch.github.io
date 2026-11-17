export const workflowExamples = {
  'shiftfolio': {
    label: 'Edit a sample roster',
    fields: [['Roster CSV', 'Name,Mon,Tue,Wed\nAva,D,E,-\nSam,N,-,D']],
    run([source]) {
      const rows = source.trim().split(/\r?\n/).map(row => row.split(',').map(cell => cell.trim()));
      const [header, ...people] = rows;
      if (header.length < 2 || !people.length) return 'Enter a header and at least one roster row.';
      const valid = new Set(['D', 'E', 'N', 'DE', 'X', '-', '']);
      if (people.some(row => row.length !== header.length || row.slice(1).some(shift => !valid.has(shift)))) {
        return 'Check the number of columns and use D, E, N, DE, X, or a dash.';
      }
      return people.map(([name, ...days]) => name + ' � ' + days.map((shift, index) =>
        header[index + 1] + ': ' + ({DE:'D + E', X:'Off', '-':'Off', '':'Off'}[shift] || shift)).join(' � ')).join('\n');
    },
  },
  'orienteering-map': {
    label: 'Calculate a route through sample checkpoints',
    fields: [['Checkpoint coordinates in metres (x,y per line)', '0,0\n30,40\n60,80\n60,20']],
    run([source]) {
      const points = source.trim().split(/\r?\n/).map(row => row.split(',').map(value => value.trim()));
      if (points.length < 2 || points.some(point => point.length !== 2 || point.some(v => !v || !Number.isFinite(Number(v))))) {
        return 'Enter at least two valid coordinate pairs.';
      }
      const lengths = points.slice(1).map(([x, y], index) => Math.hypot(x - points[index][0], y - points[index][1]));
      return lengths.map((distance, i) => 'Leg ' + (i + 1) + ': ' + distance.toFixed(2) + ' m').join('\n') +
        '\nTotal: ' + lengths.reduce((sum, distance) => sum + distance, 0).toFixed(2) + ' m';
    },
  },
  'golf-statistics': {
    label: 'Summarize sample scores',
    fields: [['Scores separated by commas', '76,84,80,79,81']],
    run([source]) {
      const scores = source.split(',').map(value => Number(value.trim()));
      if (scores.some(score => !Number.isInteger(score) || score < 1)) return 'Use positive whole numbers.';
      return 'Rounds: ' + scores.length + ' � Best: ' + Math.min(...scores) + ' � Average: ' +
        (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1);
    },
  },
  'esp32-c3-rust-rtic': {
    label: 'Compare simulated button intervals',
    fields: [['Press times (ms)', '100,300,498,702,902'], ['Tolerance (ms)', '20']],
    run([source, toleranceText]) {
      const times = source.split(',').map(value => Number(value.trim()));
      const tolerance = Number(toleranceText);
      const intervals = times.slice(1).map((time, i) => time - times[i]);
      if (intervals.length < 2 || intervals.some(interval => !Number.isFinite(interval) || interval <= 0) ||
          !Number.isFinite(tolerance) || tolerance < 0) return 'Use at least three increasing press times and a non-negative tolerance.';
      const mean = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      const error = Math.max(...intervals.map(value => Math.abs(value - mean)));
      return 'Intervals: ' + intervals.join(', ') + ' ms\nMean: ' + mean.toFixed(1) +
        ' ms � Maximum deviation: ' + error.toFixed(1) + ' ms\n' +
        (error <= tolerance ? 'Within tolerance' : 'Outside tolerance');
    },
  },
  'wireless-button-monitor': {
    label: 'Compose a representative input report',
    fields: [['Four input bits', '1010'], ['Battery voltage (V)', '3.6']],
    run([bits, voltage]) {
      if (!/^[01]{4}$/.test(bits) || !voltage.trim() || !Number.isFinite(Number(voltage)) || Number(voltage) < 0) {
        return 'Enter four bits and a valid non-negative voltage.';
      }
      return 'Sample UART text: BTN=' + bits + ',VBAT=' + Number(voltage).toFixed(2) + ' V';
    },
  },
};
