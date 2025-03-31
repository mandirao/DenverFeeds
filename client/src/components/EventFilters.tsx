import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export interface MonthOption {
  key: string;
  display: string;
}

// List of venues outside the Denver/Boulder area
export const nonDenverAreaVenues = [
  "Aggie Theatre",
  "Black Sheep",
  "Ford Amphitheater",
  "Fort Collins Armory",
  "New Belgium Brewing Company",
  "Sunset Amphitheater",
  "The Coast",
  "The Mishawaka",
  "Washington's"
];

export interface EventFiltersProps {
  // The original callback
  onFilterChange: (filters: {
    month: string;
    genre: string;
    status: string;
    denverAreaOnly: boolean;
    sortBy: string;
  }) => void;
  
  // Data
  genres: string[];
  months?: MonthOption[];
  
  // Current filter values
  monthFilter?: string;
  genreFilter?: string;
  statusFilter?: string;
  denverAreaOnlyFilter?: boolean;
  sortByFilter?: string;
  
  // Individual change handlers for navbar integration
  onMonthChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onGenreChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onStatusChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onDenverAreaOnlyChange?: (checked: boolean) => void;
  onSortByChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

// Generate an array of the next 12 months for the filter
export const getNextMonths = (): MonthOption[] => {
  const months = [];
  const currentDate = new Date();
  const monthsSeen = new Set<string>();
  
  for (let i = 0; i < 12; i++) {
    const nextMonth = new Date(currentDate);
    nextMonth.setMonth(currentDate.getMonth() + i);
    const monthKey = format(nextMonth, "MMMM yyyy");
    
    // Skip duplicates
    if (monthsSeen.has(monthKey)) {
      continue;
    }
    
    monthsSeen.add(monthKey);
    const monthDisplay = format(nextMonth, "MMMM yyyy");
    months.push({ key: monthKey, display: monthDisplay });
  }
  
  return months;
};

export function EventFilters({ 
  onFilterChange, 
  genres, 
  denverAreaOnlyFilter = true,
  sortByFilter = "date"
}: EventFiltersProps) {
  const [month, setMonth] = useState("all");
  const [genre, setGenre] = useState("all");
  const [status, setStatus] = useState("all");
  const [denverAreaOnly, setDenverAreaOnly] = useState(denverAreaOnlyFilter);
  const [sortBy, setSortBy] = useState(sortByFilter);
  const [months, setMonths] = useState<MonthOption[]>([]);
  
  useEffect(() => {
    setMonths(getNextMonths());
  }, []);

  useEffect(() => {
    // Initialize with the default filters including denverAreaOnly=true and sortBy=date
    onFilterChange({ month, genre, status, denverAreaOnly, sortBy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMonth = e.target.value;
    setMonth(newMonth);
    onFilterChange({ month: newMonth, genre, status, denverAreaOnly, sortBy });
  };

  const handleGenreChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newGenre = e.target.value;
    setGenre(newGenre);
    onFilterChange({ month, genre: newGenre, status, denverAreaOnly, sortBy });
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    setStatus(newStatus);
    
    // If selecting "top-voted", automatically set sortBy to "votes"
    if (newStatus === "top-voted") {
      setSortBy("votes");
      onFilterChange({ month, genre, status: newStatus, denverAreaOnly, sortBy: "votes" });
    } else {
      onFilterChange({ month, genre, status: newStatus, denverAreaOnly, sortBy });
    }
  };

  const handleSortByChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSortBy = e.target.value;
    setSortBy(newSortBy);
    onFilterChange({ month, genre, status, denverAreaOnly, sortBy: newSortBy });
  };

  const handleDenverAreaOnlyChange = (checked: boolean) => {
    setDenverAreaOnly(checked);
    onFilterChange({ month, genre, status, denverAreaOnly: checked, sortBy });
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
            <option value="top-voted">Top Voted</option>
            <option value="just-added">Just Added</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </div>
      </div>
      
      {/* Denver/Boulder area toggle */}
      <div className="flex items-center justify-start space-x-2 mt-4">
        <Switch 
          id="denver-area-only" 
          checked={denverAreaOnly}
          onCheckedChange={handleDenverAreaOnlyChange}
          className="bg-[#FE6B41] data-[state=checked]:bg-[#FEABDA]"
        />
        <Label htmlFor="denver-area-only" className="text-sm font-medium cursor-pointer">
          Denver/Boulder area shows only
        </Label>
      </div>
    </div>
  );
}

export default EventFilters;