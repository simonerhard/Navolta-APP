"use strict";
const GAV_YEARS = {2026:2088, 2027:2088};
const GAV_SOURCE = "https://www.plk-elektro.ch/de/gav-ave/auslegungshilfen-ab-gav-2026-2029/";
const dateShift = (date, days) => {
  const value = new Date(date+"T00:00:00Z");
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
};
const weekdayOf = date => new Date(date+"T00:00:00Z").getUTCDay();
const mondayOf = date => dateShift(date,-((weekdayOf(date)+6)%7));
const isWeekday = date => weekdayOf(date) !== 0 && weekdayOf(date) !== 6;
function dateRange(first,last) {
  const dates = [];
  for (let date=first; date<=last; date=dateShift(date,1)) dates.push(date);
  return dates;
}
function workBands(date, holiday) {
  const weekday = weekdayOf(date);
  if (holiday || weekday===0) return [[0,1440,100]];
  if (weekday===6) return [[0,360,50],[360,780,0],[780,1380,25],[1380,1440,50]];
  return [[0,360,50],[360,1380,0],[1380,1440,50]];
}
function workSegments(entry,date) {
  const bands = workBands(date,entry.holiday || entry.absence==="Feiertag");
  const segments = [];
  const pauseStart = entry.breakStart ? time(entry.breakStart) : null;
  const pauseEnd = pauseStart===null ? null : pauseStart+entry.breakMinutes;
  for (const [start,end] of entry.slots) {
    const from = time(start), to = time(end);
    for (const [bandStart,bandEnd,rate] of bands) {
      const left = Math.max(from,bandStart), right = Math.min(to,bandEnd);
      if (right<=left) continue;
      const unpaid = pauseStart===null ? 0 : Math.max(0,Math.min(right,pauseEnd)-Math.max(left,pauseStart));
      if (right-left>unpaid) segments.push({minutes:right-left-unpaid,rate});
    }
  }
  if (entry.breakMinutes && pauseStart===null) {
    const rates = new Set(segments.map(segment=>segment.rate));
    if (rates.size>1) return [{minutes:net(entry),rate:null}];
    return [{minutes:net(entry),rate:segments[0]?.rate ?? 0}];
  }
  return segments;
}
function gavDay(date,entry,previousWork) {
  const result = {regular:0, over:0, excess:0, vorhol:entry?.vorhol ?? entry?.extra?.[2] ?? 0, premiums:{25:0,50:0,100:0}, uncertain:false};
  if (!entry) return result;
  for (const {minutes,rate} of workSegments(entry,date)) {
    const excess = Math.max(0,Math.min(minutes,previousWork+minutes-50*60));
    previousWork += minutes;
    result.excess += excess;
    if (rate===null) { result.uncertain=true; continue; }
    // PLK weist Überzeit tagsüber Mo–Sa aus. Samstagszuschlag und Überzeit sind bei Überschneidung sichtbar.
    if (rate===0 || rate===25) result.over += excess;
    if (rate===0) result.regular += minutes-excess;
    else result.premiums[rate] += minutes;
  }
  if (result.vorhol>result.regular) result.uncertain=true;
  result.regular -= Math.min(result.regular,result.vorhol);
  return result;
}
function gavAccount(person,year,month,asOf) {
  if (!person || year<2026 || year>2029) return null;
  const startYear = year+"-01-01", endYear = year+"-12-31";
  const settings = person.gav?.[year] || {};
  const begin = settings.begin || startYear, end = settings.end || endYear;
  const tracked = settings.tracked || begin;
  const percent = settings.percent || 100;
  const monthBegin = keyFor(year,month,1), monthEnd = keyFor(year,month,daysIn(year,month));
  const cutoff = [monthEnd,asOf,end].sort()[0];
  const scheduled = dateRange(begin,end).filter(isWeekday);
  const annualDays = dateRange(startYear,endYear).filter(isWeekday).length;
  const fullTimeMinutes = GAV_YEARS[year] ? GAV_YEARS[year]*60 : annualDays*8*60;
  const reference = begin===startYear && end===endYear ? fullTimeMinutes : scheduled.length*8*60;
  const annualTarget = settings.target ?? Math.round(reference*percent/100);
  const beforeTracking = scheduled.filter(date=>date<tracked).length;
  const targetAt = date => scheduled.length ? Math.round(annualTarget*scheduled.filter(day=>day<=date).length/scheduled.length) : 0;
  const baseTarget = targetAt(dateShift(tracked,-1));
  const opening = cutoff>=dateShift(tracked,-1) ? settings.opening || 0 : 0;
  const days = new Map(), weeks = new Map();
  let yearActual=0, monthActual=0, open=0, uncertain=0;
  const monthSums = {over:0,excess:0,vorhol:0,premiums:{25:0,50:0,100:0}};
  // Read entire calendar weeks, including saved days belonging to the neighbouring months or years.
  for (let monday=mondayOf([monthBegin,tracked].sort()[0]); monday<=monthEnd; monday=dateShift(monday,7)) {
    let work=0, above=0, needsReview=0, weekUncertain=false;
    const through = dateShift(monday,6);
    for (const date of dateRange(monday,through)) {
      const entry = person.days[date];
      const row = gavDay(date,entry,work);
      work += entry ? net(entry) : 0;
      above += row.excess;
      needsReview += row.over;
      weekUncertain ||= row.uncertain;
      if (date>=monthBegin && date<=monthEnd) {
        days.set(date,row);
        monthSums.over += row.over;
        monthSums.excess += row.excess;
        monthSums.vorhol += row.vorhol;
        for (const rate of [25,50,100]) monthSums.premiums[rate] += row.premiums[rate];
      }
      if (date<tracked || date>cutoff) continue;
      if (!entry && isWeekday(date)) open++;
      if (row.uncertain) uncertain++;
      const credit = entry?.credited && entry.absence!=="Kompensation" && entry.absence!=="Unbezahlter Urlaub" ? entry.absenceMinutes : 0;
      const actual = row.regular+credit;
      yearActual += actual;
      if (date>=monthBegin) monthActual += actual;
    }
    if (through>=monthBegin) weeks.set(monday,{through,work,above,needsReview,uncertain:weekUncertain});
  }
  const yearTarget = Math.max(0,targetAt(cutoff)-baseTarget);
  const monthTarget = Math.max(0,targetAt(cutoff)-targetAt([dateShift(monthBegin,-1),dateShift(tracked,-1)].sort().at(-1)));
  return {days,weeks,monthSums,monthActual,monthTarget,yearActual,yearTarget,
    monthDelta:monthActual-monthTarget,yearDelta:opening+yearActual-yearTarget,open,uncertain,cutoff,tracked,annualTarget,beforeTracking,percent,
    estimated:!GAV_YEARS[year] && settings.target==null};
}
