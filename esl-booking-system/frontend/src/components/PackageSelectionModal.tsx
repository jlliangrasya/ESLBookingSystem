import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface Package {
  id: number;
  package_name: string;
  sessions_remaining: number;
  session_limit: number;
  price: number;
}

interface Props {
  show: boolean;
  onHide: () => void;
  availablePackages: Package[];
  setSelectedPackage: (id: number) => void;
  confirmPackage: (selectedSubject: string) => void;
}

const subjects = ["ENGLISH", "MATH", "SCIENCE", "CODING"];

const PackageSelectionModal: React.FC<Props> = ({
  show,
  onHide,
  availablePackages,
  setSelectedPackage,
  confirmPackage,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>("");
  const [selectedPackageId, setSelectedPackageId] = useState<number | null>(null);

  const handlePackageSelect = (packageId: number) => {
    setSelectedPackage(packageId);
    setSelectedPackageId(packageId);
  };

  const handleConfirm = () => {
    if (!selectedSubject || selectedPackageId === null) return;
    confirmPackage(selectedSubject);
    onHide();
  };

  return (
    <Dialog open={show} onOpenChange={onHide}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Select a Package &amp; Subject</DialogTitle>
          <DialogDescription>
            Choose a tutorial package and the subject you want to study.
          </DialogDescription>
        </DialogHeader>

        {/* Package table */}
        <div className="max-h-64 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/10">
                <TableHead>Package</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {availablePackages.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
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
                        ? "bg-primary/20 font-semibold"
                        : "hover:bg-muted"
                    )}
                  >
                    <TableCell>{pkg.package_name}</TableCell>
                    <TableCell>{pkg.session_limit}</TableCell>
                    <TableCell>¥ {pkg.price} RMB</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Subject selection */}
        <div className="space-y-1.5 mt-2">
          <Label htmlFor="subject-select">Select a Subject</Label>
          <Select value={selectedSubject} onValueChange={setSelectedSubject}>
            <SelectTrigger id="subject-select">
              <SelectValue placeholder="-- Choose Subject --" />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((subj) => (
                <SelectItem key={subj} value={subj}>
                  {subj}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onHide}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!selectedPackageId || !selectedSubject}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PackageSelectionModal;
