import type { FieldProps } from './FieldShell.tsx';
import { BoolField, ColourField, EnumField } from './fields/ChoiceFields.tsx';
import { ConditionField } from './fields/ConditionField.tsx';
import { GroupField } from './fields/GroupField.tsx';
import { ListField } from './fields/ListField.tsx';
import { MapField } from './fields/MapField.tsx';
import { NumberField } from './fields/NumberField.tsx';
import { AssetField, RefField } from './fields/PickField.tsx';
import { TextField } from './fields/TextField.tsx';
import { pointerOf } from './formContext.ts';

/**
 * The field for a value of any kind, in a box that says where in the record it is (`data-at`, a
 * JSON Pointer), so the Problems panel can open the form at it (M2.8). The box lays out nothing.
 */
export function FieldView(props: FieldProps) {
  return (
    <div class="form-at" data-at={pointerOf(props.path)}>
      <FieldOfKind {...props} />
    </div>
  );
}

/** One component per kind, as the type file names them. */
function FieldOfKind(props: FieldProps) {
  const { def } = props;
  switch (def.kind) {
    case 'text':
      return <TextField {...props} def={def} />;
    case 'int':
    case 'number':
      return <NumberField {...props} def={def} />;
    case 'bool':
      return <BoolField {...props} />;
    case 'enum':
      return <EnumField {...props} def={def} />;
    case 'ref':
      return <RefField {...props} def={def} />;
    case 'list':
      return <ListField {...props} def={def} />;
    case 'map':
      return <MapField {...props} def={def} />;
    case 'group':
      return <GroupField {...props} def={def} />;
    case 'colour':
      return <ColourField {...props} />;
    case 'asset':
      return <AssetField {...props} def={def} />;
    case 'condition':
      return <ConditionField {...props} />;
  }
}
