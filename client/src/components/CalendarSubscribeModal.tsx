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
  feedPath?: string;
  title?: string;
}

export function CalendarSubscribeModal({ open, onOpenChange, feedPath = "/api/calendar/feed.ics", title = "SUBSCRIBE TO SHOWS" }: CalendarSubscribeModalProps) {
  const { toast } = useToast();
  const calendarFeedUrl = `${window.location.origin}${feedPath}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#f0f0f0] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">{title}</DialogTitle>
        </DialogHeader>
        <div className="text-black text-sm space-y-4">
          <p>Add upcoming events to your Google Calendar (or any other calendar app) by subscribing to our iCalendar feed.</p>
          <div className="flex items-center gap-2">
            <Input 
              type="text" 
              readOnly 
              value={calendarFeedUrl} 
              className="text-sm bg-white border-black"
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
          <p className="text-xs text-gray-600">
            To subscribe, open your calendar application, find the option to add a calendar by URL, and paste the link above. Google Calendar typically refreshes every 8-24 hours.
          </p>
        </div>
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
