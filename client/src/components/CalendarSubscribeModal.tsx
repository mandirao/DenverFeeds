import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface CalendarSubscribeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CalendarSubscribeModal({ open, onOpenChange }: CalendarSubscribeModalProps) {
  const { toast } = useToast();
  const calendarFeedUrl = `${window.location.origin}/api/calendar/feed.ics`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#f0f0f0] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">SUBSCRIBE TO SHOWS</DialogTitle>
        </DialogHeader>
        <DialogDescription className="text-black">
          <div className="mb-4">
            Add upcoming shows to your Google Calendar (or any other calendar app) by subscribing to our iCalendar feed.
          </div>
          <div className="mb-4 flex items-center">
            <Input 
              type="text" 
              readOnly 
              value={calendarFeedUrl} 
              className="mr-2 text-sm bg-white border-black"
            />
            <Button 
              variant="outline2" 
              onClick={() => {
                navigator.clipboard.writeText(calendarFeedUrl);
                toast({
                  title: "Copied!",
                  description: "Calendar feed URL copied to clipboard.",
                });
              }}
            >
              Copy
            </Button>
          </div>
          <div className="text-xs text-gray-600 mt-2">
            To subscribe, open your calendar application, find the option to add a calendar by URL, and paste the link above. Google Calendar typically refreshes every 8-24 hours.
          </div>
        </DialogDescription>
        <DialogFooter>
          <Button variant="outline2" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useCalendarModal() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}
