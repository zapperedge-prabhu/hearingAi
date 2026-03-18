import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Globe } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { supportedLanguages, type SupportedLanguage } from "@shared/supported-languages";

interface LanguageComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  translatedLanguages?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  excludeLanguages?: string[];
}

export function LanguageCombobox({
  value,
  onValueChange,
  translatedLanguages = [],
  placeholder = "Select language...",
  disabled = false,
  className,
  excludeLanguages = [],
}: LanguageComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const availableLanguages = useMemo(() => {
    return supportedLanguages.filter(lang => !excludeLanguages.includes(lang.code));
  }, [excludeLanguages]);

  const filteredLanguages = useMemo(() => {
    if (!search) return availableLanguages;
    const searchLower = search.toLowerCase();
    return availableLanguages.filter(
      lang =>
        lang.name.toLowerCase().includes(searchLower) ||
        lang.code.toLowerCase().includes(searchLower) ||
        (lang.region && lang.region.toLowerCase().includes(searchLower))
    );
  }, [search, availableLanguages]);

  const groupedLanguages = useMemo(() => {
    const translated: SupportedLanguage[] = [];
    const notTranslated: SupportedLanguage[] = [];

    filteredLanguages.forEach(lang => {
      if (translatedLanguages.includes(lang.code)) {
        translated.push(lang);
      } else {
        notTranslated.push(lang);
      }
    });

    return { translated, notTranslated };
  }, [filteredLanguages, translatedLanguages]);

  const selectedLanguage = supportedLanguages.find(lang => lang.code === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select language"
          disabled={disabled}
          className={cn("w-full justify-between", className)}
          data-testid="language-combobox-trigger"
        >
          <span className="flex items-center gap-2 truncate">
            <Globe className="h-4 w-4 shrink-0 opacity-50" />
            {selectedLanguage ? (
              <span className="truncate">{selectedLanguage.name}</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search languages..."
            value={search}
            onValueChange={setSearch}
            data-testid="language-search-input"
          />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>No language found.</CommandEmpty>
            
            {groupedLanguages.translated.length > 0 && (
              <CommandGroup heading="Already Translated">
                {groupedLanguages.translated.map((lang) => (
                  <CommandItem
                    key={lang.code}
                    value={lang.code}
                    onSelect={() => {
                      onValueChange(lang.code);
                      setOpen(false);
                      setSearch("");
                    }}
                    className="flex items-center justify-between"
                    data-testid={`language-option-${lang.code}`}
                  >
                    <span className="flex items-center gap-2">
                      <Check
                        className={cn(
                          "h-4 w-4",
                          value === lang.code ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span>{lang.name}</span>
                      {lang.region && (
                        <span className="text-xs text-muted-foreground">
                          ({lang.region})
                        </span>
                      )}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      Translated
                    </Badge>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandGroup heading={groupedLanguages.translated.length > 0 ? "Available Languages" : "All Languages"}>
              {groupedLanguages.notTranslated.map((lang) => (
                <CommandItem
                  key={lang.code}
                  value={lang.code}
                  onSelect={() => {
                    onValueChange(lang.code);
                    setOpen(false);
                    setSearch("");
                  }}
                  data-testid={`language-option-${lang.code}`}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === lang.code ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span>{lang.name}</span>
                  {lang.region && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({lang.region})
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
