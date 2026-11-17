export const models = {
  'arduino-dc-motor-pid': {
    context: 'A first-order DC motor model with proportional and integral speed control. Gains and plant constants are illustrative.',
    axes: ['Time (s)', 'Speed (rpm)'],
    inputs: [['Target (rpm)', 400, 2000, 100, 1200], ['Proportional gain', 0, 4, .1, 1.2], ['Integral gain', 0, 6, .1, 2]],
    compute([target, kp, ki]) {
      let speed = 0, integral = 0;
      const points = [];
      for (let n = 0; n <= 600; n++) {
        points.push([n / 100, speed, target]);
        const error = target - speed;
        const command = kp * error + ki * integral;
        const voltage = Math.min(2400, Math.max(0, command));
        if (voltage === command || (command > voltage && error < 0) || (command < voltage && error > 0)) {
          integral += error / 100;
        }
        speed += (voltage - speed) / 50;
      }
      return points;
    },
  },
  'PID_StepperMotor': {
    context: 'An ideal stepper command quantized by steps per revolution. The reference line is the requested angle. This model assumes each pulse produces one step.',
    axes: ['Time (s)', 'Angle (deg)'],
    inputs: [['Target (deg)', 5, 180, 5, 90], ['Steps per revolution', 12, 200, 4, 48], ['Pulses per second', 2, 60, 1, 12]],
    compute([angle, steps, rate]) {
      const increment = 360 / steps;
      const targetSteps = Math.round(angle / increment);
      return sample(4, time => [Math.min(targetSteps, Math.floor(time * rate)) * increment, angle]);
    },
  },
  'mems-force-sensor': {
    context: 'Small-deflection Euler-Bernoulli model for a rectangular silicon cantilever. Compare tip deflection as you change load and thickness. The geometry is illustrative.',
    axes: ['Load (mN)', 'Tip deflection (�m)'],
    inputs: [['Maximum load (mN)', .01, .5, .01, .2], ['Length (mm)', .5, 2, .1, 1], ['Thickness (�m)', 15, 60, 1, 25]],
    compute([load, length, thickness]) {
      const inertia = .0003 * (thickness * 1e-6) ** 3 / 12;
      return sample(load, force => [force * 1e-3 * (length * .001) ** 3 / (3 * 160e9 * inertia) * 1e6]);
    },
  },
  'dji-mavic-sim': {
    context: 'A vertical flight model using Newton's second law, constant thrust and linear drag. The controls use illustrative values.',
    axes: ['Time (s)', 'Altitude (m)'],
    inputs: [['Mass (kg)', .5, 1.3, .05, .75], ['Total thrust (N)', 4, 16, .2, 9.6], ['Linear drag (N�s/m)', 0, 2, .1, .4]],
    compute([mass, thrust, drag]) {
      let height = 0, speed = 0;
      const points = [];
      for (let n = 0; n <= 500; n++) {
        points.push([n / 100, height]);
        speed += (thrust / mass - 9.81 - drag * speed / mass) / 100;
        height += speed / 100;
        if (height < 0) { height = 0; speed = 0; }
      }
      return points;
    },
  },
  'GPU-Accelerated-Satellite-Sim': {
    context: 'An ideal two-body circular orbit around Earth. The model visualizes periodic motion from Newtonian gravity. Its time scale is physical.',
    axes: ['Time (min)', 'Projected position (km)'],
    inputs: [['Orbital altitude (km)', 200, 2000, 50, 500], ['Initial phase (deg)', 0, 360, 15, 0]],
    compute([altitude, phase]) {
      const radius = 6371 + altitude;
      const omega = Math.sqrt(398600.4418 / radius ** 3);
      return sample(2 * Math.PI / (60 * omega), time => [radius * Math.cos(time * 60 * omega + phase * Math.PI / 180)]);
    },
  },
  'Sounder': {
    context: 'An ideal square wave that shows the relationship between oscillator frequency and waveform period. Amplitude is normalized.',
    axes: ['Time (ms)', 'Amplitude'],
    inputs: [['Frequency (Hz)', 100, 1000, 25, 250], ['Duty cycle (%)', 10, 90, 5, 50]],
    compute([frequency, duty]) {
      return sample(12, time => [((time * frequency / 1000) % 1) * 100 < duty ? 1 : 0], 600);
    },
  },
  'tinnitus-audio-anc-concept': {
    context: 'An illustrative signal model for interference at one point. Compare the original wave and the sum after you adjust the second wave's phase and amplitude.',
    axes: ['Time (ms)', 'Amplitude'],
    inputs: [['Frequency (Hz)', 100, 800, 20, 300], ['Phase difference (deg)', 0, 360, 5, 160], ['Second wave amplitude', 0, 1.5, .05, 1]],
    compute([frequency, phase, amplitude]) {
      return sample(10, time => {
        const angle = time * frequency * 2 * Math.PI / 1000;
        return [Math.sin(angle) + amplitude * Math.sin(angle + phase * Math.PI / 180), Math.sin(angle)];
      });
    },
  },
  'arduino-tft-volume-gauge': {
    context: 'An ideal 10-bit ADC model. Sweep the potentiometer input and compare the digital reading with the continuous input. Reference voltage and sweep range are adjustable.',
    axes: ['Input (V)', 'ADC count'],
    inputs: [['Reference voltage (V)', 2.5, 5, .1, 5], ['Maximum input (V)', .1, 5, .1, 3.3]],
    compute([reference, max]) {
      return sample(max, volt => [Math.min(1023, Math.floor(volt / reference * 1024)), 1023 * volt / reference]);
    },
  },
  'adjustable-conveyor-fixture': {
    context: 'A constant-speed belt timing model. The belt position advances until it reaches the adjustable trigger. The example compares distance and travel time.',
    axes: ['Time (s)', 'Position (m)'],
    inputs: [['Trigger distance (m)', .2, 2, .1, .8], ['Belt speed (m/s)', .1, 1, .05, .4]],
    compute([distance, speed]) {
      return sample(distance / speed * 1.5, time => [speed * time, distance]);
    },
  },
  'automated-sorting-conveyor': {
    context: 'A constant-speed conveyor with a detection point and downstream sorter. Set the actuation delay to align it with the object's arrival.',
    axes: ['Time (s)', 'Position (m)'],
    inputs: [['Sensor-to-sorter distance (m)', .2, 2, .1, 1], ['Belt speed (m/s)', .1, 1, .05, .5], ['Actuation delay (s)', .1, 4, .1, 1.5]],
    compute([distance, speed, delay]) {
      return sample(Math.max(distance / speed, delay) * 1.25, time => [time * speed, distance, time >= delay ? distance : 0]);
    },
  },
};

function sample(end, values, count = 240) {
  return Array.from({length: count + 1}, (_, i) => {
    const x = end * i / count;
    return [x, ...values(x)];
  });
}
