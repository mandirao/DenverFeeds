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
  isDuplicate?: boolean;
}

export default function EditEventModal({ event, isOpen, onClose, isDuplicate = false }: EditEventModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Update event mutation (for editing)
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

  // Create event mutation (for duplicating)
  const createEventMutation = useMutation({
    mutationFn: async (data: EventFormValues) => {
      return apiRequest({
        endpoint: "/api/events",
        method: "POST",
        data
      });
    },
    onSuccess: () => {
      toast({
        title: "Event Created",
        description: "The duplicate event has been created successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      onClose();
    },
    onError: (error: any) => {
      console.error("Event create error:", error);
      
      if (error.response?.status === 409 || error.message?.includes("already exists")) {
        setDuplicateError("This event already exists in the database.");
      } else if (error.response?.status === 400) {
        toast({
          title: "Validation Error",
          description: error.response?.data?.message || "Please check your form inputs.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to create event. Please try again.",
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
    if (isDuplicate) {
      createEventMutation.mutate(data);
    } else {
      updateEventMutation.mutate(data);
    }
  };

  const activeMutation = isDuplicate ? createEventMutation : updateEventMutation;

  const handleDelete = () => {
    deleteEventMutation.mutate();
  };

  // Format the date for display in the delete confirmation
  const formattedDate = event.date 
    ? new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown date';

  // Format the created date for metadata footer
  const createdDate = event.createdAt
    ? new Date(event.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-[#F5F3F0]">
        <DialogHeader>
          <DialogTitle className="text-2xl text-black font-black uppercase">
            {isDuplicate ? "DUPLICATE SHOW" : "EDIT SHOW"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isDuplicate ? "Create a duplicate event with modifications" : "Edit event details"}
          </DialogDescription>
        </DialogHeader>
        <EventForm
          onSubmit={handleSubmit}
          onCancel={onClose}
          initialData={event}
          submitButtonText={isDuplicate ? "CREATE" : "UPDATE"}
          isPending={activeMutation.isPending}
          duplicateError={duplicateError}
          extraActions={
            !isDuplicate ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="link" 
                    className="text-red-500 hover:text-red-600 font-normal underline px-2 h-auto"
                  >
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-[#F5F3F0]">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Event</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this event? This action cannot be undone.
                    </AlertDialogDescription>
                    <div className="mt-2 px-6">
                      <strong>{event.artist}</strong> @ {event.venue} ({formattedDate})
                    </div>
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
            ) : undefined
          }
        />
        {!isDuplicate && createdDate && (
          <div className="mt-4 pt-3 border-t border-gray-300 text-xs text-gray-500">
            Added {createdDate}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}