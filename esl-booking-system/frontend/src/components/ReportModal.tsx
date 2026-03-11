import { useState } from "react";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
  bookingId: number;
  studentId: number;
  studentName: string;
}

const ReportModal: React.FC<ReportModalProps> = ({
  open,
  onClose,
  bookingId,
  studentId,
  studentName,
}) => {
  const [newWords, setNewWords] = useState("");
  const [sentences, setSentences] = useState("");
  const [notes, setNotes] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("token");
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/reports`,
        {
          booking_id: bookingId,
          student_id: studentId,
          new_words: newWords,
          sentences,
          notes,
          remarks,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setNewWords("");
        setSentences("");
        setNotes("");
        setRemarks("");
        onClose();
      }, 1500);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.message || "Failed to submit report");
      } else {
        setError("An error occurred");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Class Report — {studentName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <Alert className="border-green-500 bg-green-50 text-green-700">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription>Report submitted successfully!</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label>New Words</Label>
            <Textarea
              rows={2}
              placeholder="e.g. persevere, eloquent, ambiguous..."
              value={newWords}
              onChange={(e) => setNewWords(e.target.value)}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Sentences</Label>
            <Textarea
              rows={3}
              placeholder="Sample sentences used in class..."
              value={sentences}
              onChange={(e) => setSentences(e.target.value)}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              placeholder="Topic covered, areas practiced..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Remarks</Label>
            <Textarea
              rows={2}
              placeholder="Overall performance and feedback..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || success}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Report"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportModal;
