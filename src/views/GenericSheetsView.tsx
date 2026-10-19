import { Page, SectionHeader } from '../components/AppShell'
import { MaterialsTab, type SheetActions } from '../components/child/MaterialsTab'
import { Button } from '../components/ui'
import type { Sheet } from '../types'

/** "Schede senza bambino": materiali generici, con la stessa impaginazione della cartella del bambino. */
export function GenericSheetsView({
  sheets,
  sheetActions,
  onBack,
  onNewSheet,
}: {
  sheets: Sheet[]
  sheetActions: SheetActions
  onBack: () => void
  onNewSheet: () => void
}) {
  return (
    <Page>
      <SectionHeader
        title="Schede senza bambino"
        subtitle={`${sheets.length} ${sheets.length === 1 ? 'scheda' : 'schede'}`}
        onBack={onBack}
        actions={
          <Button tone="primary" onClick={onNewSheet}>
            + Nuovo materiale
          </Button>
        }
      />
      <MaterialsTab
        generic
        sheets={sheets}
        goals={[]}
        links={null}
        actions={sheetActions}
        onNewSheet={onNewSheet}
        onSetGoals={() => Promise.resolve()}
      />
    </Page>
  )
}
