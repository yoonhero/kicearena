type WebkitAudioWindow = Window &
    typeof globalThis & {
        webkitAudioContext?: typeof AudioContext;
    };

export const playAuraMinusCue = () => {
    const AudioContextCtor =
        window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
    if (!AudioContextCtor) return undefined;

    const context = new AudioContextCtor();
    const master = context.createGain();
    const now = context.currentTime;
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
    master.connect(context.destination);

    const playTone = (delay: number, frequency: number, duration: number, type: OscillatorType) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now + delay);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, now + delay + duration);
        gain.gain.setValueAtTime(0.0001, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.38, now + delay + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(now + delay);
        oscillator.stop(now + delay + duration + 0.04);
    };

    const playNoise = (delay: number, duration: number) => {
        const buffer = context.createBuffer(
            1,
            Math.floor(context.sampleRate * duration),
            context.sampleRate,
        );
        const data = buffer.getChannelData(0);
        for (let index = 0; index < data.length; index += 1)
            data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();
        filter.type = "highpass";
        filter.frequency.setValueAtTime(1700, now + delay);
        gain.gain.setValueAtTime(0.12, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + duration);
        source.buffer = buffer;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(master);
        source.start(now + delay);
    };

    void context.resume();
    playTone(0, 196, 0.18, "sawtooth");
    playTone(0.16, 146.83, 0.18, "square");
    playTone(0.32, 220, 0.2, "sawtooth");
    playTone(0.58, 98, 0.34, "square");
    playNoise(0.1, 0.18);
    playNoise(0.48, 0.22);

    const closeTimer = window.setTimeout(() => {
        void context.close();
    }, 1500);

    return () => {
        window.clearTimeout(closeTimer);
        void context.close();
    };
};
