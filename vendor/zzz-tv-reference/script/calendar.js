export class Calendar {
  constructor(calendarYearMonth, calendarHeader, calendarGrid) {
    this.calendarYearMonth = calendarYearMonth;
    this.calendarHeader = calendarHeader;
    this.calendarGrid = calendarGrid;
    this.circleImages = Array.from(
      { length: 5 },
      (_, i) => `../resource/svg/circle${i + 1}.svg`
    );
    this.lastUpdatedDay = 0;
  }

  start(updateCalendarInterval = 60 * 1000) {
    this.updateCalendar();
    setInterval(() => {
      const now = new Date();
      const currentDay = now.getDate();
      if (currentDay !== this.lastUpdatedDay) {
        this.updateCalendar();
        this.lastUpdatedDay = currentDay;
      }
    }, updateCalendarInterval);
  }

  updateCalendar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    this.calendarHeader.innerHTML = "";

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    this.calendarYearMonth.innerHTML = `${year}<br>${monthNames[month]}`;

    daysOfWeek.forEach((day) => {
      const dayEl = document.createElement("div");
      dayEl.textContent = day;
      this.calendarHeader.appendChild(dayEl);
    });

    this.calendarGrid.innerHTML = "";

    for (let i = 0; i < firstDayOfMonth; i++) {
      const emptyDay = document.createElement("div");
      this.calendarGrid.appendChild(emptyDay);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dayEl = document.createElement("div");
      dayEl.classList.add("day");
      if (day === today) {
        dayEl.classList.add("today");
        this.applyRandomImage(dayEl);
      }
      dayEl.textContent = day;
      this.calendarGrid.appendChild(dayEl);
    }
  }

  applyRandomImage(element) {
    const randomImage =
      this.circleImages[Math.floor(Math.random() * this.circleImages.length)];
    element.style.setProperty("--circle-image", `url(${randomImage})`);
  }
}
