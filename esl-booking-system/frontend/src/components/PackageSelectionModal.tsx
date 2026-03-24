import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ArrowLeft, Upload, QrCode } from "lucide-react";

interface Package {
  id: number;
  package_name: string;
  session_limit: number;
  price: number;
  subject: string | null;
  duration_minutes: number;
  description: string | null;
}

interface Teacher {
  id: number;
  name: string;
}

interface Props {
  show: boolean;
  onHide: () => void;
  availablePackages: Package[];
  setSelectedPackage: (id: number) => void;
  confirmPackage: (receiptImage: string | null, teacherId: number | null) => void;
  allowPickTeacher: boolean;
  teachers: Teacher[];
  companyQrImage: string | null;
}

const PackageSelectionModal: React.FC<Props> = ({
  show,
  onHide,
  availablePackages,
  setSelectedPackage,
  confirmPackage,
  allowPickTeacher,
  teachers,
  companyQrImage,
}) => {
  const [step, setStep] = useState<"select" | "payment">("select");
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");

  const selectedPkg = availablePackages.find((p) => p.id === selectedPackageId);

  const handlePackageSelect = (packageId: number) => {
    setSelectedPackageId(packageId);
    setSelectedPackage(packageId);
  };

  const handleReceiptUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setReceiptImage(base64);
      setReceiptPreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleConfirm = () => {
    confirmPackage(receiptImage, selectedTeacherId ? Number(selectedTeacherId) : null);
    handleReset();
  };

  const handleReset = () => {
    setStep("select");
    setSelectedPackageId(null);
    setReceiptImage(null);
    setReceiptPreview(null);
    setSelectedTeacherId("");
  };

  const handleClose = () => {
    handleReset();
    onHide();
  };

  return (
    <Dialog open={show} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === "select" ? "Select a Package" : "Payment & Enrollment"}
          </DialogTitle>
          <DialogDescription>
            {step === "select"
              ? "Choose a class package to enroll in."
              : `Enrolling in: ${selectedPkg?.package_name}`}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Package Selection */}
        {step === "select" && (
          <>
            <div className="max-h-64 overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="brand-gradient-subtle">
                    <TableHead>Package</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {availablePackages.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        No packages available.
                      </TableCell>
                    </TableRow>
                  ) : (
                    availablePackages.map((pkg) => (
                      <TableRow
                        key={pkg.id}
                        onClick={() => handlePackageSelect(pkg.id)}
                        className={cn(
                          "cursor-pointer transition-colors",
                          selectedPackageId === pkg.id
                            ? "bg-[#EEF6FA] font-semibold ring-1 ring-[#D0E8F0]"
                            : "hover:bg-muted"
                        )}
                      >
                        <TableCell>
                          <div className="font-medium text-sm">{pkg.package_name}</div>
                          {pkg.description && (
                            <div className="text-xs text-muted-foreground">{pkg.description}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{pkg.subject || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {pkg.session_limit} × {pkg.duration_minutes}min
                        </TableCell>
                        <TableCell className="text-sm font-medium">
                          ₱{Number(pkg.price).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => setStep("payment")} disabled={!selectedPackageId}>
                Next →
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Payment */}
        {step === "payment" && (
          <>
            <div className="space-y-4 py-1">
              {/* QR code */}
              {companyQrImage ? (
                <div className="flex flex-col items-center gap-2 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <QrCode className="h-4 w-4" />
                    Scan to Pay
                  </div>
                  <img src={companyQrImage} alt="Payment QR" className="max-w-[160px] rounded-lg" />
                  <p className="text-xs text-muted-foreground text-center">
                    Amount: <span className="font-semibold text-foreground">₱{Number(selectedPkg?.price ?? 0).toLocaleString()}</span>
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg p-3 bg-muted/20 text-sm text-muted-foreground text-center">
                  Contact your admin for payment instructions.
                </div>
              )}

              {/* Receipt upload */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Upload Payment Receipt <span className="text-destructive">*</span></Label>
                <p className="text-xs text-muted-foreground">Take a screenshot of your payment and upload it here.</p>
                <label className="flex items-center gap-2 cursor-pointer border-2 border-dashed rounded-lg p-3 hover:bg-muted/30 transition-colors">
                  <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">
                    {receiptPreview ? "Receipt uploaded — click to change" : "Click to upload receipt image"}
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleReceiptUpload} />
                </label>
                {receiptPreview && (
                  <img src={receiptPreview} alt="Receipt preview" className="max-h-32 rounded-lg border mx-auto block" />
                )}
              </div>

              {/* Teacher picker */}
              {allowPickTeacher && teachers.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Preferred Teacher (optional)</Label>
                  <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Let admin assign" />
                    </SelectTrigger>
                    <SelectContent>
                      {teachers.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("select")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={handleConfirm} disabled={!receiptImage}>
                Confirm Enrollment
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PackageSelectionModal;
