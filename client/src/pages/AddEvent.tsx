import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useToast } from "@/hooks/use-toast";
import EventForm, { EventFormValues } from "@/components/EventForm";

export default function AddEvent() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  // Add single event mutation
  const addEventMutation = useMutation({
    mutationFn: async (data: EventFormValues) => {
      return apiRequest({
        endpoint: "/api/events",
        method: "POST",
        data
      });
    },
    onSuccess: () => {
      toast({
        title: "Event Added",
        description: "The event has been added successfully!",
      });
      navigate("/");
    },
    onError: (error: any) => {
      console.error("Single event add error:", error);
      
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
          description: "Failed to add event. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  // Handle form submission
  const handleSubmit = (data: EventFormValues) => {
    setDuplicateError(null);
    addEventMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar showFilters={false} />
      
      <main className="container mx-auto px-4 py-8">
        <div className="bg-[#FEABDA] rounded-lg p-6">
          <h2 className="text-2xl text-black mb-6 font-anton font-black uppercase">ADD A SHOW</h2>
          
          <EventForm 
            onSubmit={handleSubmit}
            isPending={addEventMutation.isPending}
            duplicateError={duplicateError}
            submitButtonText="ADD SHOW"
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
