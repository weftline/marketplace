# Feature delivery

One section per version: upstream's notes first, Weftline's second (MARKETPLACE.md section 3.1).

## 0.1.0

### Upstream

The template as `services/internal/flow/templates/feature-delivery` holds it (F-0609): the flow, the fixture
its dry run starts from and must end as, and its eval scenario.

### Weftline

The first catalog entry (F-1201). A project installs it as its own flow's version 1 (FlowService.InstallFlowTemplate);
the catalog is where the Flows screen's templates come from once the mirror loads it (F-1202, F-1203).
