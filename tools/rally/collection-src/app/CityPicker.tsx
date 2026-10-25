import SharedPicker from './SharedPicker';
import {festivalEditions} from '../lib/festivals';
import './city-picker.css';

const commonCities = [
  'San Francisco, CA', 'Los Angeles, CA', 'San Diego, CA', 'San Bernardino, CA',
  'Oakland, CA', 'San Jose, CA', 'Sacramento, CA', 'Palm Springs, CA',
  'Las Vegas, NV', 'Reno, NV', 'Phoenix, AZ', 'Tempe, AZ', 'Denver, CO',
  'Salt Lake City, UT', 'Seattle, WA', 'Portland, OR', 'Austin, TX', 'Dallas, TX',
  'Houston, TX', 'Miami, FL', 'Orlando, FL', 'Tampa, FL', 'Atlanta, GA',
  'Chicago, IL', 'Detroit, MI', 'Minneapolis, MN', 'Columbus, OH',
  'New York, NY', 'Brooklyn, NY', 'Boston, MA', 'Philadelphia, PA', 'Washington, DC',
  'Charlotte, NC', 'Nashville, TN', 'New Orleans, LA',
  'Vancouver, Canada', 'Toronto, Canada', 'Montreal, Canada', 'Mexico City, Mexico',
  'London, UK', 'Amsterdam, Netherlands', 'Berlin, Germany', 'Ibiza, Spain',
  'Barcelona, Spain', 'Paris, France', 'Lisbon, Portugal', 'Tokyo, Japan',
  'Bangkok, Thailand', 'Singapore', 'Sydney, Australia', 'Melbourne, Australia',
];

export default function CityPicker({value, cities, onChange}: {value: string; cities: string[]; onChange: (city: string) => void}) {
  // Keep the exact saved value available, including a custom city. Suggestions
  // are local reference data and this account’s diary; no location lookup.
  const names = new Map<string, string>();
  for (const city of [value, ...cities, ...festivalEditions.map(e => e.city), ...commonCities]) {
    const clean = city.trim();
    const key = clean.toLocaleLowerCase().replace(/\s+/g, ' ');
    if (clean && !names.has(key)) names.set(key, city === value ? value : clean);
  }
  return <div className="field city-picker">
    <SharedPicker label="City" value={value} allowCustom searchTokens onChange={onChange}
      options={[{value:'',label:'Choose a city…'}, ...[...names.values()].sort((a,b)=>a.localeCompare(b)).map(city=>({value:city,label:city}))]}/>
    <small>Search cities or type your own and choose “Use”.</small>
  </div>;
}
