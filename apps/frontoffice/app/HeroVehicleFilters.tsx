"use client";

import { useMemo, useState } from "react";
import { Car, Search } from "lucide-react";
import type { PublicVehicleCatalogModel } from "./vehicles/service";
import { formatThousands } from "./formatters";

type HeroVehicleFiltersProps = {
  action: string;
  language: "en" | "zh";
  models: PublicVehicleCatalogModel[];
  years: number[];
  budgets: number[];
  vehicleCount: number;
  showInventorySummary: boolean;
  labels: {
    make: string;
    anyBrand: string;
    model: string;
    anyModel: string;
    budget: string;
    anyBudget: string;
    yearFrom: string;
    anyYear: string;
    find: string;
    readyCars: string;
    updatedDaily: string;
    searchHint: string;
  };
};

export function HeroVehicleFilters({
  action,
  language,
  models,
  years,
  budgets,
  vehicleCount,
  showInventorySummary,
  labels
}: HeroVehicleFiltersProps) {
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const makes = useMemo(
    () => [...new Set(models.map((item) => item.make))].sort((left, right) => left.localeCompare(right)),
    [models]
  );
  const modelsForMake = useMemo(
    () => models.filter((item) => !make || item.make === make),
    [make, models]
  );

  return (
    <form className="atelierSearch" action={action}>
      {language === "zh" && <input type="hidden" name="lang" value="zh" />}
      <label>
        <span>{labels.make}</span>
        <select
          name="make"
          value={make}
          onChange={(event) => {
            setMake(event.target.value);
            setModel("");
          }}
        >
          <option value="">{labels.anyBrand}</option>
          {makes.map((item) => <option value={item} key={item}>{item}</option>)}
        </select>
      </label>
      <label>
        <span>{labels.model}</span>
        <select name="model" value={model} onChange={(event) => setModel(event.target.value)}>
          <option value="">{labels.anyModel}</option>
          {modelsForMake.map((item) => <option value={item.model} key={`${item.make}-${item.model}`}>{item.model}</option>)}
        </select>
      </label>
      <label>
        <span>{labels.budget}</span>
        <select name="maxPrice" defaultValue="">
          <option value="">{labels.anyBudget}</option>
          {budgets.map((budget) => <option value={budget} key={budget}>RM {formatThousands(budget)}</option>)}
        </select>
      </label>
      <label>
        <span>{labels.yearFrom}</span>
        <select name="minYear" defaultValue="">
          <option value="">{labels.anyYear}</option>
          {years.map((year) => <option value={year} key={year}>{year}</option>)}
        </select>
      </label>
      <button type="submit"><span>{labels.find}</span> <Search size={18} /></button>
      {showInventorySummary && (
        <span className="heroInventorySummary">
          <Car size={28} aria-hidden="true" />
          <span><strong>{vehicleCount.toLocaleString()} {labels.readyCars}</strong><small>{labels.updatedDaily}</small></span>
        </span>
      )}
      <small className="heroSearchHint">{labels.searchHint}</small>
    </form>
  );
}
