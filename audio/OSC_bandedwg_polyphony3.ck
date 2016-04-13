//------------------------------------------------
// name: OSC_bandedwg_polyphony.ck 
// desc: polyphonic bandedwg synthesis that receives OSC msgs
//
// based on polyfony2.ck by: Ananya Misra and Ge Wang
// this code is by Jennifer Hsu
//--------------------------------------------

// === OSC setup ===
OscRecv recv;
1234 => recv.port;
recv.listen();

// tell the OSC reciever to listen for specific types of messages
recv.event("/noteon", "f f f f f f f") @=> OscEvent noteOn;
// /noteon ID freq height timeUntilOff
// NEW params
// velocity, adsr attack time, release time (ms)
// /noteon freqlow freqcutoff velocity[0 to 1] attackTimeMs releaseMs timeUntillOff
// ==================

// === the base patch ===
Gain g => JCRev r => Dyno d => dac;

// settings for gain, reverb, and dynamics set as a limiter
.95 => g.gain;
.025 => r.mix;
0.1 => d.slopeAbove;
1.0 => d.slopeBelow;
0.5 => d.thresh;
5::ms => d.attackTime;
300::ms => d.releaseTime;
0 => d.externalSideInput;
// ======================

// NoteEvent class
class NoteEvent extends Event
{
    float freqLow;
    float freqCutoff;
    float velocity;
    float attackTime;
    float releaseTime;
    float timeUntilOff;
}

NoteEvent on;

// array of ugen's handling each note
Event @ us[128];

// === handler shred for a single voice ===
fun void handler()
{
    // don't connect to dac until we need it
    BandedWG bwg => SinOsc overdrive => LPF lpf => ADSR env;
    Event off;
    float freqLow;
    float freqCutoff;
    float velocity;
    float attackTime;
    float releaseTime;
    float timeUntilOff;
    
    0.95 => bwg.gain;
    2 => bwg.preset;
    1.0 => bwg.modesGain;
    
    // sinusoid for overdrive/distortion:
    // http://electro-music.com/forum/viewtopic.php?t=19287
    1 => overdrive.sync; // set sync option to Phase Mod.
    1000 => overdrive.gain; 
    220 => overdrive.freq;
    
    lpf.set(20000, 3);
    
    // inifinite time loop
    while( true )
    {
        on => now;
        
        on.freqLow => freqLow;
        on.freqCutoff => freqCutoff;
        on.velocity => velocity;
        on.attackTime => attackTime;
        on.releaseTime => releaseTime;
        on.timeUntilOff => timeUntilOff;
        
        // dynamically repatch
        env => g;
        
        // set parameters
        freqLow => bwg.freq;
        freqCutoff => lpf.freq;
        velocity => bwg.pluck; 
        env.set( attackTime::ms, 0::ms, 1.0, releaseTime::ms );
        
        // turn the note on
        env.keyOn();
        
        // i don't know what this means
        //off @=> us[note];
        
        // turn the noteoff
        on.timeUntilOff::ms => now;
        env.keyOff();
        
        // null @=> us[note];
        releaseTime::ms => now;
        env =< g;
    }
}
// ===================================================

// spork handlers, one for each voice
for( 0 => int i; i < 20; i++ ) spork ~ handler();

// === main loop ===
// this loop waits for an OSC message to arrive
// once that arrives, it checks to see if the velocity
// of the incoming note is above 0 (note on) or not (note off)
// and sends a signal to the appropriate handler
while( true )
{

    // wait for the event to arrive
    noteOn => now;
    
    // grab the next message from the queue
    while( noteOn.nextMsg() != 0)
    {
        noteOn.getFloat() => float ID;
        noteOn.getFloat() => float freqLow;
        noteOn.getFloat() => float freqCutoff;
        noteOn.getFloat() => float velocity;
        noteOn.getFloat() => float attackTime;
        noteOn.getFloat() => float releaseTime;
        noteOn.getFloat() => float timeUntilOff;
        <<< "freqLow:", freqLow, "freqCutoff:", freqCutoff, "velocity:", velocity, "attackTime: ", attackTime, "releaseTime:", releaseTime, "timeUntilOff:", timeUntilOff >>>;

        
        // set the parameters for the NoteEvent object
        freqLow => on.freqLow;
        freqCutoff => on.freqCutoff;
        velocity => on.velocity;
        attackTime => on.attackTime;
        releaseTime => on.releaseTime;
        timeUntilOff => on.timeUntilOff;
        // signal the event
        on.signal();
        // yield without advancing time to allow shred to run
        me.yield();
        
        // turn the note off
        //if( us[note] != null ) 
            //us[note].signal();
        
    }
}
