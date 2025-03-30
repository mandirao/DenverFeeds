import { useState, useEffect } from "react";
import { format } from "date-fns";

export interface MonthOption {
  key: string;
  display: string;
}

export interface EventFiltersProps {
  // The original callback
  onFilterChange: (filters: {
    month: string;
    genre: string;
    status: string;
  }) => void;
  
  // Data
  genres: string[];
  months?: MonthOption[];
  
  // Current filter values
  monthFilter?: string;
  genreFilter?: string;
  statusFilter?: string;
  
  // Individual change handlers for navbar integration
  onMonthChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onGenreChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onStatusChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

// Generate an array of the next 12 months for the filter
export const getNextMonths = (): MonthOption[] => {
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

export function EventFilters({ onFilterChange, genres }: EventFiltersProps) {
  const [month, setMonth] = useState("all");
  const [genre, setGenre] = useState("all");
  const [status, setStatus] = useState("all");
  const [months, setMonths] = useState<MonthOption[]>([]);
  
  useEffect(() => {
    setMonths(getNextMonths());
  }, []);

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

  return (
    <div className="mb-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
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
          <select 
            id="genre-filter" 
            value={genre}
            onChange={handleGenreChange}
            className="w-full p-2 border-2 border-black bg-[#FE6B41] text-black rounded-none"
          >
            <option value="all">All Genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        
        <div>
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
