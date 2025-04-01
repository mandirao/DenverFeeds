import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from "@/components/ui/dialog";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Event } from "@shared/schema";
import EventForm, { EventFormValues } from "@/components/EventForm";
import { Button } from "@/components/ui/button";

interface EditEventModalProps {
  event: Event;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditEventModal({ event, isOpen, onClose }: EditEventModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Update event mutation
  const updateEventMutation = useMutation({
    mutationFn: async (data: EventFormValues) => {
      return apiRequest({
        endpoint: `/api/events/${event.id}`,
        method: "PATCH",
        data
      });
    },
    onSuccess: () => {
      toast({
        title: "Event Updated",
        description: "The event has been updated successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      onClose();
    },
    onError: (error: any) => {
      console.error("Event update error:", error);
      
      if (error.response?.status === 409 || error.message?.includes("already exists")) {
        setDuplicateError("This event already exists in the database.");
      } else if (error.response?.status === 400) {
        // Handle validation errors
        toast({
          title: "Validation Error",
          description: error.response?.data?.message || "Please check your form inputs.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to update event. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async () => {
      return apiRequest({
        endpoint: `/api/events/${event.id}`,
        method: "DELETE"
      });
    },
    onSuccess: () => {
      toast({
        title: "Event Deleted",
        description: "The event has been deleted successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      onClose();
    },
    onError: (error: any) => {
      console.error("Event delete error:", error);
      toast({
        title: "Error",
        description: "Failed to delete event. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: EventFormValues) => {
    setDuplicateError(null);
    updateEventMutation.mutate(data);
  };

  const handleDelete = () => {
    deleteEventMutation.mutate();
  };

  // Format the date for display in the delete confirmation
  const formattedDate = event.date 
    ? new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown date';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-[#FEABDA]">
        <DialogHeader>
          <DialogTitle className="text-2xl text-black font-anton font-black uppercase">EDIT SHOW</DialogTitle>
          <DialogDescription className="sr-only">
            Edit event details
          </DialogDescription>
        </DialogHeader>
        <EventForm
          onSubmit={handleSubmit}
          onCancel={onClose}
          initialData={event}
          submitButtonText="UPDATE"
          isPending={updateEventMutation.isPending}
          duplicateError={duplicateError}
        />
        
        <DialogFooter className="mt-8 pb-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button 
                variant="outline" 
                className="border-red-500 text-red-500 hover:bg-red-500/10 hover:text-red-600"
              >
                Delete Event
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Event</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this event? This action cannot be undone.
                  <p className="mt-2">
                    <strong>{event.artist}</strong> @ {event.venue} ({formattedDate})
                  </p>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleDelete}
                  className="bg-red-500 hover:bg-red-600"
                  disabled={deleteEventMutation.isPending}
                >
                  {deleteEventMutation.isPending ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}