// This should work both in node and in the browsers, so that's what this wrapper is about
;(function(root, undefined) {
    // An arbitrary "close enough" number to check if the frame rate is 29.97 or
    // 59.94
    var DROP_FRAME_EPSILON = 0.0001;

    /**
     * Timecode object constructor
     * @param {number|String|Date|Object} timeCode Frame count as number, "HH:MM:SS(:|;|.)FF", Date(), or object.
     * @param {number} frameRate Frame rate
     * @param {boolean} [dropFrame=true] Whether the timecode is drop-frame or not
     * @constructor
     * @returns {Timecode} timecode
     */
    var Timecode = function ( timeCode, frameRate, dropFrame ) {

        // Make this class safe for use without "new"
        if (!(this instanceof Timecode)) return new Timecode( timeCode, frameRate, dropFrame);

        // Get frame rate
        if (typeof frameRate === 'number' && frameRate>0) this.frameRate = frameRate;
        else throw new Error('Number expected as framerate');

        // If we are passed dropFrame, we need to use it
        if (typeof dropFrame === 'boolean') this.dropFrame = dropFrame;
        // Otherwise, default to DF for 29.97 and 59.94
        else this.dropFrame = this._is30DF() || this._is60DF();

        // Now either get the frame count, string or datetime        
        if (typeof timeCode === 'number') {
            this.frameCount = Math.round(timeCode);
            this._frameCountToTimeCode();
        }
        else if (typeof timeCode === 'string') {
            // pick it apart
            var parts = timeCode.match('^([012]\\d)[:;](\\d\\d)[:;](\\d\\d)(:|;|\\.)(\\d\\d)$');
            if (!parts) throw new Error("Timecode string expected as HH:MM:SS:FF or HH:MM:SS;FF or HH;MM;SS;FF");
            this.hours = parseInt(parts[1]);
            this.minutes = parseInt(parts[2]);
            this.seconds = parseInt(parts[3]);
            // do not override input parameters
            if (typeof dropFrame !== 'boolean') {
                this.dropFrame = parts[4]!==':';
            }
            this.frames = parseInt(parts[5]);
            this._timeCodeToFrameCount();
        }
        else if (typeof timeCode === 'object' && timeCode instanceof Date) {
            var midnight = new Date(timeCode.getFullYear(), timeCode.getMonth(), timeCode.getDate(),0,0,0);
            var midnight_tz = midnight.getTimezoneOffset() * 60 * 1000;
            var timecode_tz = timeCode.getTimezoneOffset() * 60 * 1000;
            this.frameCount = Math.round(((timeCode-midnight + (midnight_tz - timecode_tz))*this.frameRate)/1000);
            this._frameCountToTimeCode();
        }
        else if (typeof timeCode === 'object' && typeof (timeCode.hours) != 'undefined') {
            this.hours = timeCode.hours;
            this.minutes = timeCode.minutes;
            this.seconds = timeCode.seconds;
            this.frames = timeCode.frames;
            this._timeCodeToFrameCount();
        }
        else if (typeof timeCode === 'undefined') {
            this.frameCount = 0;
        }
        else {
            throw new Error('Timecode() constructor expects a number, timecode string, or Date()');
        }

        this._validate(timeCode);

        return this;
    };

    /**
     * Validates timecode
     * @private
     * @param {number|String|Date|Object} timeCode for the reference
     */
    Timecode.prototype._validate = function (timeCode) {

        // Make sure dropFrame is only for 29.97 & 59.94
        if (this.dropFrame && !this._is30DF() && !this._is60DF()) {
            throw new Error('Drop frame is only supported for 29.97 and 59.94 fps');
        }

        // make sure the numbers make sense
        if (this.hours > 23 || this.minutes > 59 || this.seconds > 59 || this.frames >= this.frameRate ||
            (this.dropFrame && this.seconds === 0 && this.minutes % 10 && this.frames < this._numOfFramesToDrop())) {
            throw new Error("Invalid timecode" + JSON.stringify(timeCode));
        }
    };

    /**
     * Calculate timecode based on frame count
     * @private
     */
    Timecode.prototype._frameCountToTimeCode = function() {
        var fc = this.frameCount;
        // adjust for dropFrame
        if (this.dropFrame) {
            var df = this._numOfFramesToDrop(); 
            var d = Math.floor(this.frameCount / (17982*df/2));
            var m = this.frameCount % (17982*df/2);
            if (m<df) m=m+df;
            fc += 9*df*d + df*Math.floor((m-df)/(1798*df/2));
        }
        var fps = Math.round(this.frameRate);
        this.frames = fc % fps;
        this.seconds = Math.floor(fc/fps) % 60;
        this.minutes = Math.floor(fc/(fps*60)) % 60;
        this.hours = Math.floor(fc/(fps*3600)) % 24;
    };

    /**
     * Calculate frame count based on time Timecode
     * @private
     */
    Timecode.prototype._timeCodeToFrameCount = function() {
        this.frameCount = (this.hours*3600 + this.minutes*60 + this.seconds) * Math.round(this.frameRate) + this.frames;
        // adjust for dropFrame
        if (this.dropFrame) {
            var totalMinutes = this.hours*60 + this.minutes;
            var df = this._numOfFramesToDrop();
            this.frameCount -= df * (totalMinutes - Math.floor(totalMinutes/10));    
        }
    };

    /**
     * Is the frame rate 29.97 (30000/1001) or close enough to it
     * @private
     */
    Timecode.prototype._is30DF = function () {
        return Math.abs(30000/1001 - this.frameRate) < DROP_FRAME_EPSILON;
    };

    /**
    * Is the frame rate 59.94 (60000/1001) or close enough to it
    * @private
    */
    Timecode.prototype._is60DF = function () {
        return Math.abs(60000/1001 - this.frameRate) < DROP_FRAME_EPSILON;
    };

    /**
     * Get the number of frames to drop — 29.97 skips 2 frames, 59.94 skips 4
     * frames.
     * @private
     */
    Timecode.prototype._numOfFramesToDrop = function () {
        if (this._is30DF()) return 2;
        else if (this._is60DF()) return 4;
        else return 0;
    };

    /**
     * Convert Timecode to String
     * @param {String} format output format
     * @returns {string} timecode
     */
    Timecode.prototype.toString = function TimeCodeToString(format) {
        var frames = this.frames;
        var field = '';
        if (typeof format === 'string') {
            if (format === 'field') {
                if (this.frameRate<=30) field = '.0';
                else {
                    frames = Math.floor(frames/2);
                    field = '.'.concat((this.frameCount%2).toString());
                };
            }
            else throw new Error('Unsupported string format');
        };
        return "".concat(
            this.hours<10 ? '0' : '',
            this.hours.toString(),
            ':',
            this.minutes<10 ? '0' : '',
            this.minutes.toString(),
            ':',
            this.seconds<10 ? '0' : '',
            this.seconds.toString(),
            this.dropFrame ? ';' : ':',
            frames<10 ? '0' : '',
            frames.toString(),
            field
        );
    };

    /**
     * @returns {Number} the frame count when Timecode() object is used as a number
     */
    Timecode.prototype.valueOf = function() {
        return this.frameCount;
    };

    /**
     * Adds t to timecode, in-place (i.e. the object itself changes)
     * @param {number|string|Date|Timecode} t How much to add
     * @param {boolean} [negative=false] Whether we are adding or subtracting
     * @param {Number} [rollOverMaxHours] allow rollovers
     * @returns {Timecode} timecode
     */
    Timecode.prototype.add = function (t, negative, rollOverMaxHours) {
        if (typeof t === 'number') {
            var newFrameCount = this.frameCount + Math.round(t) * (negative?-1:1);
            if (newFrameCount<0 && rollOverMaxHours > 0) {
                newFrameCount = (Math.round(this.frameRate*86400)) + newFrameCount;
                if (((newFrameCount / this.frameRate) / 3600) > rollOverMaxHours) {
                    throw new Error('Rollover arithmetic exceeds max permitted');
                }
            }
            if (newFrameCount<0) {
                throw new Error("Negative timecodes not supported");
            }
            this.frameCount = newFrameCount;
        }
        else {
            if (!(t instanceof Timecode)) t = new Timecode(t, this.frameRate, this.dropFrame);
            return this.add(t.frameCount,negative,rollOverMaxHours);
        }
        this.frameCount = this.frameCount % (Math.round(this.frameRate*86400)); // wraparound 24h
        this._frameCountToTimeCode();
        return this;
    };


    Timecode.prototype.subtract = function(t, rollOverMaxHours) {
        return this.add(t,true,rollOverMaxHours);
    };

    /**
     * Converts timecode to a Date() object
     * @returns {Date} date
     */
    Timecode.prototype.toDate = function() {
        var ms = this.frameCount/this.frameRate*1000;
        var midnight = new Date();
        midnight.setHours(0);
        midnight.setMinutes(0);
        midnight.setSeconds(0);
        midnight.setMilliseconds(0);

        var d = new Date( midnight.valueOf() + ms );
        var midnight_tz = midnight.getTimezoneOffset() * 60 * 1000;
        var timecode_tz = d.getTimezoneOffset() * 60 * 1000;
        return new Date( midnight.valueOf() + ms + (timecode_tz-midnight_tz));
    };

    // Export it for Node or attach to root for in-browser
    /* istanbul ignore else */
    if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
        module.exports = Timecode;
    } else if (root) {
        root.Timecode = Timecode;
    }


}(this));
