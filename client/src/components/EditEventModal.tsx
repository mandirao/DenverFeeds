import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Event } from "@shared/schema";
import EventForm, { EventFormValues } from "@/components/EventForm";

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

  const handleSubmit = (data: EventFormValues) => {
    setDuplicateError(null);
    updateEventMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto bg-[#FEABDA]">
        <DialogHeader>
          <DialogTitle className="text-2xl text-black font-anton font-black uppercase">EDIT SHOW</DialogTitle>
        </DialogHeader>
        <EventForm
          onSubmit={handleSubmit}
          onCancel={onClose}
          initialData={event}
          submitButtonText="UPDATE"
          isPending={updateEventMutation.isPending}
          duplicateError={duplicateError}
        />
      </DialogContent>
    </Dialog>
  );
}