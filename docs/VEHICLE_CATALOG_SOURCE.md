# Malaysia Vehicle Make and Model Catalogue Source

The default back-office vehicle catalogue is derived from the Malaysian Government's
[Car Registration Transactions](https://data.gov.my/data-catalogue/registration_transactions_car)
dataset, sourced from the Road Transport Department (JPJ) and Ministry of Transport.

## Seed Method

- Source files: `cars_2025.csv` and `cars_2026.csv`.
- Data coverage: 1 January 2025 through 31 July 2026.
- Included vehicle types: the source catalogue's car classes, including motorcars, MPVs, jeeps, pick-up trucks, and window vans.
- Included pairs: non-blank make/model pairs with at least 100 registrations across the source period.
- Excluded pairs: blank models and source values such as `Unknown`, `Other`, and `N/A`.
- Result: 198 recent Malaysian-market make/model pairs.

The seed is idempotent. It adds missing source pairs and make/model pairs already present
in YS Heng stock, without overwriting staff-created catalogue entries or changing an
entry's visible/hidden status.

## Attribution

The source data is licensed under the
[Creative Commons Attribution 4.0 International licence](https://creativecommons.org/licenses/by/4.0/).
The committed seed stores make/model facts only; raw registration transactions are not
included in this repository.
