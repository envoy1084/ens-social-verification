import { AlertDialog } from "@thenamespace/uikit/alert-dialog";
import { Button } from "@thenamespace/uikit/button";

export function ConnectXDialog({
  name,
  isOpen,
  onOpenChange,
  onCancel,
  onContinue,
  busy,
}: {
  name: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onContinue: () => void;
  busy: boolean;
}) {
  return (
    <AlertDialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Backdrop>
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>Before you connect X</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className="space-y-4 text-sm leading-6">
              <p>
                We request read and write access to publish a public verification post linking your
                X account to <strong className="[overflow-wrap:anywhere]">{name}</strong>. You will
                preview the post and sign with your wallet before we publish it.
              </p>
              <p>
                <strong>Keep the post public and unchanged.</strong> Verifiers need to read it;
                deleting or editing it breaks verification. Remove verification first when you no
                longer want the link.
              </p>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={onCancel}>
                Cancel
              </Button>
              <Button onPress={onContinue} isDisabled={busy}>
                Continue to X
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}
