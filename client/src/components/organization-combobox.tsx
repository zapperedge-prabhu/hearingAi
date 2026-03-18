import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Organization {
  id: number;
  name: string;
  description?: string;
}

interface OrganizationComboboxProps {
  organizations: Organization[];
  value: number | null;
  onValueChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
}

export function OrganizationCombobox({
  organizations,
  value,
  onValueChange,
  placeholder = "Select organization...",
  disabled = false,
  className,
  triggerClassName,
}: OrganizationComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOrganizations = useMemo(() => {
    if (!search) return organizations;
    const searchLower = search.toLowerCase();
    return organizations.filter(
      org =>
        org.name.toLowerCase().includes(searchLower) ||
        (org.description && org.description.toLowerCase().includes(searchLower))
    );
  }, [search, organizations]);

  const selectedOrganization = organizations.find(org => org.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select organization"
          disabled={disabled}
          className={cn(
            "w-full justify-between border-none bg-transparent h-auto p-1 font-medium text-primary hover:text-primary/80 focus:ring-0",
            triggerClassName
          )}
          data-testid="organization-combobox-trigger"
        >
          <span className="flex items-center gap-2 truncate">
            {selectedOrganization ? (
              <span className="truncate">{selectedOrganization.name}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[320px] p-0", className)} align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search organizations..."
            value={search}
            onValueChange={setSearch}
            data-testid="organization-search-input"
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No organization found.</CommandEmpty>
            
            <CommandGroup heading="Organizations">
              {filteredOrganizations.map((org) => (
                <CommandItem
                  key={org.id}
                  value={org.id.toString()}
                  onSelect={() => {
                    onValueChange(org.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  data-testid={`organization-option-${org.id}`}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === org.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{org.name}</span>
                    {org.description && (
                      <span className="text-xs text-muted-foreground">
                        {org.description}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
