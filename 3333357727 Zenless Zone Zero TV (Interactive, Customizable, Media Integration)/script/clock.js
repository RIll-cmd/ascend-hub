export class Clock {
    constructor(hourTens, hourOnes, minuteTens, minuteOnes) {
      this.hourTens = hourTens;
      this.hourOnes = hourOnes;
      this.minuteTens = minuteTens;
      this.minuteOnes = minuteOnes;
    }
  
    start(updateInterval = 1000) {
      this.updateClock();
      this.intervalId = setInterval(() => this.updateClock(), updateInterval);
    }
  
    updateClock() {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, "0");
      const minutes = now.getMinutes().toString().padStart(2, "0");
      this.hourTens.textContent = hours[0];
      this.hourOnes.textContent = hours[1];
      this.minuteTens.textContent = minutes[0];
      this.minuteOnes.textContent = minutes[1];
    }
  
    stop() {
      clearInterval(this.intervalId);
    }
  }
  