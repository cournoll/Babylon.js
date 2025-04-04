import { NodeGeometryBlock } from "../nodeGeometryBlock";
import type { NodeGeometryConnectionPoint } from "../nodeGeometryBlockConnectionPoint";
import { RegisterClass } from "../../../Misc/typeStore";
import { NodeGeometryBlockConnectionPointTypes } from "../Enums/nodeGeometryConnectionPointTypes";
import type { NodeGeometryBuildState } from "../nodeGeometryBuildState";
import { PropertyTypeForEdition, editableInPropertyPage } from "../../../Decorators/nodeDecorator";
import { WithinEpsilon } from "../../../Maths/math.scalar.functions";
import { GeometryInputBlock } from "./geometryInputBlock";
import type { NodeGeometry } from "../nodeGeometry";

/**
 * Conditions supported by the condition block
 */
export enum ConditionBlockTests {
    /** Equal */
    Equal,
    /** NotEqual */
    NotEqual,
    /** LessThan */
    LessThan,
    /** GreaterThan */
    GreaterThan,
    /** LessOrEqual */
    LessOrEqual,
    /** GreaterOrEqual */
    GreaterOrEqual,
    /** Logical Exclusive OR */
    Xor,
    /** Logical Or */
    Or,
    /** Logical And */
    And,
}

/**
 * Block used to evaluate a condition and return a true or false value
 */
export class ConditionBlock extends NodeGeometryBlock {
    /**
     * Gets or sets the test used by the block
     */
    @editableInPropertyPage("Test", PropertyTypeForEdition.List, "ADVANCED", {
        notifiers: { rebuild: true },
        embedded: true,
        options: [
            { label: "Equal", value: ConditionBlockTests.Equal },
            { label: "NotEqual", value: ConditionBlockTests.NotEqual },
            { label: "LessThan", value: ConditionBlockTests.LessThan },
            { label: "GreaterThan", value: ConditionBlockTests.GreaterThan },
            { label: "LessOrEqual", value: ConditionBlockTests.LessOrEqual },
            { label: "GreaterOrEqual", value: ConditionBlockTests.GreaterOrEqual },
            { label: "Xor", value: ConditionBlockTests.Xor },
            { label: "Or", value: ConditionBlockTests.Or },
            { label: "And", value: ConditionBlockTests.And },
        ],
    })
    public test = ConditionBlockTests.Equal;

    /**
     * Gets or sets the epsilon value used for comparison
     */
    @editableInPropertyPage("Epsilon", PropertyTypeForEdition.Float, "ADVANCED", { embedded: true, notifiers: { rebuild: true } })
    public epsilon = 0;

    /**
     * Create a new ConditionBlock
     * @param name defines the block name
     */
    public constructor(name: string) {
        super(name);

        this.registerInput("left", NodeGeometryBlockConnectionPointTypes.Float);
        this.registerInput("right", NodeGeometryBlockConnectionPointTypes.Float, true, 0);
        this.registerInput("ifTrue", NodeGeometryBlockConnectionPointTypes.AutoDetect, true, 1);
        this.registerInput("ifFalse", NodeGeometryBlockConnectionPointTypes.AutoDetect, true, 0);

        this.registerOutput("output", NodeGeometryBlockConnectionPointTypes.BasedOnInput);

        this._outputs[0]._typeConnectionSource = this._inputs[2];
        this._outputs[0]._defaultConnectionPointType = NodeGeometryBlockConnectionPointTypes.Float;
        this._inputs[0].acceptedConnectionPointTypes.push(NodeGeometryBlockConnectionPointTypes.Int);
        this._inputs[1].acceptedConnectionPointTypes.push(NodeGeometryBlockConnectionPointTypes.Int);
        this._linkConnectionTypes(2, 3);
    }

    /**
     * Gets the current class name
     * @returns the class name
     */
    public override getClassName() {
        return "ConditionBlock";
    }

    /**
     * Gets the left input component
     */
    public get left(): NodeGeometryConnectionPoint {
        return this._inputs[0];
    }

    /**
     * Gets the right input component
     */
    public get right(): NodeGeometryConnectionPoint {
        return this._inputs[1];
    }

    /**
     * Gets the ifTrue input component
     */
    public get ifTrue(): NodeGeometryConnectionPoint {
        return this._inputs[2];
    }

    /**
     * Gets the ifFalse input component
     */
    public get ifFalse(): NodeGeometryConnectionPoint {
        return this._inputs[3];
    }

    /**
     * Gets the output component
     */
    public get output(): NodeGeometryConnectionPoint {
        return this._outputs[0];
    }

    public override autoConfigure(nodeGeometry: NodeGeometry) {
        if (!this.ifTrue.isConnected) {
            const minInput =
                (nodeGeometry.getBlockByPredicate((b) => b.isInput && (b as GeometryInputBlock).value === 1 && b.name === "True") as GeometryInputBlock) ||
                new GeometryInputBlock("True");
            minInput.value = 1;
            minInput.output.connectTo(this.ifTrue);
        }

        if (!this.ifFalse.isConnected) {
            const maxInput =
                (nodeGeometry.getBlockByPredicate((b) => b.isInput && (b as GeometryInputBlock).value === 0 && b.name === "False") as GeometryInputBlock) ||
                new GeometryInputBlock("False");
            maxInput.value = 0;
            maxInput.output.connectTo(this.ifFalse);
        }
    }

    protected override _buildBlock() {
        if (!this.left.isConnected) {
            this.output._storedFunction = null;
            this.output._storedValue = null;
            return;
        }

        const func = (state: NodeGeometryBuildState) => {
            const left = this.left.getConnectedValue(state) as number;
            const right = this.right.getConnectedValue(state) as number;
            let condition = false;

            switch (this.test) {
                case ConditionBlockTests.Equal:
                    condition = WithinEpsilon(left, right, this.epsilon);
                    break;
                case ConditionBlockTests.NotEqual:
                    condition = !WithinEpsilon(left, right, this.epsilon);
                    break;
                case ConditionBlockTests.LessThan:
                    condition = left < right + this.epsilon;
                    break;
                case ConditionBlockTests.GreaterThan:
                    condition = left > right - this.epsilon;
                    break;
                case ConditionBlockTests.LessOrEqual:
                    condition = left <= right + this.epsilon;
                    break;
                case ConditionBlockTests.GreaterOrEqual:
                    condition = left >= right - this.epsilon;
                    break;
                case ConditionBlockTests.Xor:
                    condition = (!!left && !right) || (!left && !!right);
                    break;
                case ConditionBlockTests.Or:
                    condition = !!left || !!right;
                    break;
                case ConditionBlockTests.And:
                    condition = !!left && !!right;
                    break;
            }
            return condition;
        };

        this.output._storedFunction = (state) => {
            if (func(state)) {
                return this.ifTrue.getConnectedValue(state);
            }

            return this.ifFalse.getConnectedValue(state);
        };
    }

    protected override _dumpPropertiesCode() {
        let codeString = super._dumpPropertiesCode() + `${this._codeVariableName}.test = BABYLON.ConditionBlockTests.${ConditionBlockTests[this.test]};\n`;
        codeString += `${this._codeVariableName}.epsilon = ${this.epsilon};\n`;
        return codeString;
    }

    /**
     * Serializes this block in a JSON representation
     * @returns the serialized block object
     */
    public override serialize(): any {
        const serializationObject = super.serialize();

        serializationObject.test = this.test;
        serializationObject.epsilon = this.epsilon;

        return serializationObject;
    }

    public override _deserialize(serializationObject: any) {
        super._deserialize(serializationObject);

        this.test = serializationObject.test;
        if (serializationObject.epsilon !== undefined) {
            this.epsilon = serializationObject.epsilon;
        }
    }
}

RegisterClass("BABYLON.ConditionBlock", ConditionBlock);
