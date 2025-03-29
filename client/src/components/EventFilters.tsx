import { useState } from "react";
import { format } from "date-fns";

interface EventFiltersProps {
  onFilterChange: (filters: {
    month: string;
    genre: string;
    status: string;
  }) => void;
  genres: string[];
}

export function EventFilters({ onFilterChange, genres }: EventFiltersProps) {
  const [month, setMonth] = useState("all");
  const [genre, setGenre] = useState("all");
  const [status, setStatus] = useState("all");

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = e.target.value;
    setMonth(newMonth);
    onFilterChange({ month: newMonth, genre, status });
  };

  const handleGenreChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newGenre = e.target.value;
    setGenre(newGenre);
    onFilterChange({ month, genre: newGenre, status });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    setStatus(newStatus);
    onFilterChange({ month, genre, status: newStatus });
  };

  // Generate an array of the next 12 months for the filter
  const getNextMonths = () => {
    const months = [];
    const currentDate = new Date();
    
    for (let i = 0; i < 12; i++) {
      const nextMonth = new Date(currentDate);
      nextMonth.setMonth(currentDate.getMonth() + i);
      const monthKey = format(nextMonth, "MMMM yyyy");
      const monthDisplay = format(nextMonth, "MMMM yyyy");
      months.push({ key: monthKey, display: monthDisplay });
    }
    
    return months;
  };

  const months = getNextMonths();

  return (
    <div className="bg-[#FEABDA] rounded-lg p-4 mb-8">
      <h2 className="text-xl text-black mb-4 font-anton">FILTER SHOWS</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="month-filter" className="block text-black mb-2 font-sora">MONTH</label>
          <select 
            id="month-filter" 
            value={month}
            onChange={handleMonthChange}
            className="w-full p-2 border-2 border-black bg-[#FE6B41] text-black rounded-none"
          >
            <option value="all">All Months</option>
            {months.map((m) => (
              <option key={m.key} value={m.key}>{m.display}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="genre-filter" className="block text-black mb-2 font-sora">GENRE</label>
          <select 
            id="genre-filter" 
            value={genre}
            onChange={handleGenreChange}
            className="w-full p-2 border-2 border-black bg-[#FE6B41] text-black rounded-none"
          >
            <option value="all">All Genres</option>
            {genres.map((g) => (
              <option key={g} value={g.toLowerCase()}>{g}</option>
            ))}
          </select>
        </div>
        
        <div>
          <label htmlFor="status-filter" className="block text-black mb-2 font-sora">STATUS</label>
          <select 
            id="status-filter" 
            value={status}
            onChange={handleStatusChange}
            className="w-full p-2 border-2 border-black bg-[#FE6B41] text-black rounded-none"
          >
            <option value="all">Show All</option>
            <option value="just-added">Just Added</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export default EventFilters;
