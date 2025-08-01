import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, MapPin, ExternalLink } from "lucide-react";

interface VenueOption {
  venue: string;
  date: string;
  source?: string;
}

interface VenueSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  venueOptions: VenueOption[];
  onSelect: (option: VenueOption) => void;
  artistName: string;
}

export function VenueSelectionModal({
  isOpen,
  onClose,
  venueOptions,
  onSelect,
  artistName
}: VenueSelectionModalProps) {
  const [selectedOption, setSelectedOption] = useState<VenueOption | null>(null);

  const handleSelect = () => {
    if (selectedOption) {
      onSelect(selectedOption);
      onClose();
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Select Show Details for {artistName}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <p className="text-sm text-gray-600 mb-4">
            Multiple upcoming shows found. Choose the one you want to add:
          </p>
          
          <div className="space-y-3">
            {venueOptions.map((option, index) => (
              <div
                key={index}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedOption === option
                    ? 'border-black bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setSelectedOption(option)}
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-500" />
                      <span className="font-medium">{option.venue}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(option.date)}</span>
                    </div>
                    {option.source && (
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <ExternalLink className="h-3 w-3" />
                        <span>Found on {option.source}</span>
                      </div>
                    )}
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 ${
                    selectedOption === option
                      ? 'border-black bg-black'
                      : 'border-gray-300'
                  }`} />
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSelect}
              disabled={!selectedOption}
              className="flex-1 bg-black text-white hover:bg-black/80"
            >
              Use This Show
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}