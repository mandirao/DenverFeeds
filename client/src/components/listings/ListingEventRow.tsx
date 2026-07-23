import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical } from "lucide-react";
import { ensureHttps, formatDateRange, formatTime, createSearchUrl, createCalendarUrl } from "@/lib/eventUtils";
import type { ListingEventBase, ListingRowConfig } from "@/lib/listingFeedConfig";

export function ListingEventRow<T extends ListingEventBase>({ event, config }: { event: T; config: ListingRowConfig<T> }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [showRequesterTooltip, setShowRequesterTooltip] = useState(false);

  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venue + " Denver CO")}`;
  const calendarUrl = createCalendarUrl(event);
  const location = event.neighborhood ? `${event.venue}, ${event.neighborhood}` : event.venue;
  const category = config.getCategory(event);
  const EditModal = config.EditModal;

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `${config.apiPath}/${event.id}`, method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [config.queryKey] });
      toast({ title: "Deleted", description: `${event.name} removed from the feed.` });
    },
    onError: () => toast({ title: "Error", description: "Couldn't delete this event.", variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `${config.apiPath}/${event.id}/duplicate`, method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [config.queryKey] });
      toast({ title: "Duplicated", description: `${event.name} copied to the feed.` });
    },
    onError: () => toast({ title: "Error", description: "Couldn't duplicate this event.", variant: "destructive" }),
  });

  const soldOutMutation = useMutation({
    mutationFn: () => apiRequest({ endpoint: `${config.apiPath}/${event.id}`, method: "PATCH", data: { soldOut: !event.soldOut } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [config.queryKey] });
      toast({ title: event.soldOut ? config.soldOutRestoreLabel : "Marked as sold out", description: event.name });
    },
    onError: () => toast({ title: "Error", description: "Couldn't update this event.", variant: "destructive" }),
  });

  return (
    <>
      <li className="pb-1.5 relative flex items-start group">
        <span className="text-2xl mr-3 select-none">{event.emoji}</span>

        {event.soldOut ? (
          <div className="flex-1 text-base opacity-60">
            <span className="font-bold">{event.name}</span>
            {" "}
            <span className="inline-flex items-center align-middle text-xs font-black uppercase leading-none px-2 py-[3px] bg-black text-white">
              SOLD OUT
            </span>
            {event.sourceUrl && (
              <a
                href={ensureHttps(event.sourceUrl!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center align-middle ml-2 bg-black text-white hover:text-[#41F2EE] text-xs font-black uppercase leading-none px-2 py-[3px] transition-colors"
              >
                View Post
              </a>
            )}
            {config.renderLiveBadge(event)}
          </div>
        ) : (
          <div className="flex-1 text-base">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={createSearchUrl(event)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold border-b border-dotted border-black hover:border-solid hover:text-black cursor-pointer"
                  >
                    {event.name}
                  </a>
                </TooltipTrigger>
                <TooltipContent><p>Search on Google</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {" @ "}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="border-b border-dotted border-black hover:border-solid hover:text-black cursor-pointer"
                  >
                    {location}
                  </a>
                </TooltipTrigger>
                <TooltipContent><p>Find on Google Maps</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {" ("}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={calendarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium border-b border-dotted border-black hover:border-solid cursor-pointer text-black"
                  >
                    {formatDateRange(event.dateStart, event.dateEnd)}
                  </a>
                </TooltipTrigger>
                <TooltipContent><p>Add to Google Calendar</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {event.startTime && /^\d{1,2}:\d{2}$/.test(event.startTime) && (
              <span className="text-black/60">{", "}{formatTime(event.startTime)}</span>
            )}
            {"). "}

            {config.renderRecurringNote?.(event)}

            {event.summary}

            {event.isRecurring && event.instanceNotes?.[event.dateStart] && (
              config.renderInstanceNote(event.instanceNotes[event.dateStart])
            )}

            {category && (
              <span className="italic"> {category}.</span>
            )}

            {event.price && (
              <span
                className="inline-flex items-center align-middle ml-2 text-xs font-black uppercase leading-none px-2 py-[3px]"
                style={{ backgroundColor: "white", border: "1.5px solid black" }}
              >
                {event.price}
              </span>
            )}

            {event.ticketUrl && (
              <a
                href={ensureHttps(event.ticketUrl!)}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center align-middle ml-2 bg-black ${config.ticketTextColorClass} hover:text-[#41F2EE] text-xs font-black uppercase leading-none px-2 py-[3px] transition-colors`}
              >
                {config.ticketLabel}
              </a>
            )}

            {event.sourceUrl && (
              <a
                href={ensureHttps(event.sourceUrl!)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center align-middle ml-2 bg-black text-white hover:text-[#41F2EE] text-xs font-black uppercase leading-none px-2 py-[3px] transition-colors"
              >
                View Post
              </a>
            )}

            {config.renderLiveBadge(event)}

            {event.requester && event.requester !== 'Mandi' && (
              <span className="inline-block align-middle ml-2">
                <TooltipProvider>
                  <Tooltip open={showRequesterTooltip}>
                    <TooltipTrigger asChild>
                      <span
                        className="text-base inline-flex items-center cursor-pointer"
                        style={{ position: 'relative', top: '-1px' }}
                        onClick={() => { setShowRequesterTooltip(true); setTimeout(() => setShowRequesterTooltip(false), 2000); }}
                        onMouseEnter={() => setShowRequesterTooltip(true)}
                        onMouseLeave={() => setShowRequesterTooltip(false)}
                      >
                        🛎️
                      </span>
                    </TooltipTrigger>
                    <TooltipContent><p>Added by {event.requester}</p></TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
            )}
          </div>
        )}

        {/* Three-dot menu */}
        <div className="ml-2 flex-shrink-0" style={{ position: "relative", top: "2px" }}>
          <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-5 w-5 p-0 flex items-center justify-center rounded-full bg-transparent opacity-30 group-hover:opacity-70 transition-opacity"
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36 border-none bg-gray-100 shadow-md rounded-sm font-sans">
              <DropdownMenuItem
                onClick={() => { setIsMenuOpen(false); setIsEditOpen(true); }}
                className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
              >
                Edit details
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { setIsMenuOpen(false); soldOutMutation.mutate(); }}
                disabled={soldOutMutation.isPending}
                className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
              >
                {event.soldOut ? "Mark available" : "Mark sold out"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => { setIsMenuOpen(false); duplicateMutation.mutate(); }}
                disabled={duplicateMutation.isPending}
                className="text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
              >
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-500 focus:text-red-500 text-sm py-1.5 focus:bg-gray-200 hover:bg-gray-200 rounded-none"
                onClick={() => {
                  setIsMenuOpen(false);
                  setTimeout(() => setShowDeleteConfirm(true), 100);
                }}
              >
                Delete event
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </li>

      {/* Edit modal */}
      {isEditOpen && (
        <EditModal event={event} onClose={() => setIsEditOpen(false)} />
      )}

      {/* Delete confirm */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="border-2 border-black rounded-none" style={{ backgroundColor: config.dialogBg }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl uppercase">{config.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm">
              <strong>{event.name}</strong> will be permanently removed from the feed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-2 border-black rounded-none font-black text-xs uppercase hover:bg-black hover:text-white transition-colors">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-black text-white border-2 border-black rounded-none font-black text-xs uppercase hover:text-red-400 transition-colors"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default ListingEventRow;
