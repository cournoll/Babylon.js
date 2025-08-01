import type { Nullable } from "../types";
import { SmartArray } from "../Misc/smartArray";
import type { Observer } from "../Misc/observable";
import { Observable } from "../Misc/observable";
import { Vector2 } from "../Maths/math.vector";
import type { Camera } from "../Cameras/camera";
import { Effect } from "../Materials/effect";
import { Constants } from "../Engines/constants";
import type { RenderTargetCreationOptions } from "../Materials/Textures/textureCreationOptions";
import type { IInspectable } from "../Misc/iInspectable";
import type { Color4 } from "../Maths/math.color";

import type { NodeMaterial } from "../Materials/Node/nodeMaterial";
import { serialize, serializeAsColor4 } from "../Misc/decorators";
import { SerializationHelper } from "../Misc/decorators.serialization";
import { GetClass, RegisterClass } from "../Misc/typeStore";
import type { RenderTargetWrapper } from "../Engines/renderTargetWrapper";
import { ShaderLanguage } from "../Materials/shaderLanguage";

import type { Scene } from "../scene";
import type { InternalTexture } from "../Materials/Textures/internalTexture";
import type { Animation } from "../Animations/animation";
import type { PrePassRenderer } from "../Rendering/prePassRenderer";
import type { PrePassEffectConfiguration } from "../Rendering/prePassEffectConfiguration";
import { AbstractEngine } from "../Engines/abstractEngine";
import { GetExponentOfTwo } from "../Misc/tools.functions";
import type { IAssetContainer } from "core/IAssetContainer";
import type { EffectWrapperCustomShaderCodeProcessing, EffectWrapperCreationOptions } from "../Materials/effectRenderer";
import { EffectWrapper } from "../Materials/effectRenderer";

declare module "../Engines/abstractEngine" {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface AbstractEngine {
        /**
         * Sets a texture to the context from a postprocess
         * @param channel defines the channel to use
         * @param postProcess defines the source postprocess
         * @param name name of the channel
         */
        setTextureFromPostProcess(channel: number, postProcess: Nullable<PostProcess>, name: string): void;

        /**
         * Binds the output of the passed in post process to the texture channel specified
         * @param channel The channel the texture should be bound to
         * @param postProcess The post process which's output should be bound
         * @param name name of the channel
         */
        setTextureFromPostProcessOutput(channel: number, postProcess: Nullable<PostProcess>, name: string): void;
    }
}

AbstractEngine.prototype.setTextureFromPostProcess = function (channel: number, postProcess: Nullable<PostProcess>, name: string): void {
    let postProcessInput = null;
    if (postProcess) {
        if (postProcess._forcedOutputTexture) {
            postProcessInput = postProcess._forcedOutputTexture;
        } else if (postProcess._textures.data[postProcess._currentRenderTextureInd]) {
            postProcessInput = postProcess._textures.data[postProcess._currentRenderTextureInd];
        }
    }

    this._bindTexture(channel, postProcessInput?.texture ?? null, name);
};

AbstractEngine.prototype.setTextureFromPostProcessOutput = function (channel: number, postProcess: Nullable<PostProcess>, name: string): void {
    this._bindTexture(channel, postProcess?._outputTexture?.texture ?? null, name);
};

declare module "../Materials/effect" {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    export interface Effect {
        /**
         * Sets a texture to be the input of the specified post process. (To use the output, pass in the next post process in the pipeline)
         * @param channel Name of the sampler variable.
         * @param postProcess Post process to get the input texture from.
         */
        setTextureFromPostProcess(channel: string, postProcess: Nullable<PostProcess>): void;

        /**
         * (Warning! setTextureFromPostProcessOutput may be desired instead)
         * Sets the input texture of the passed in post process to be input of this effect. (To use the output of the passed in post process use setTextureFromPostProcessOutput)
         * @param channel Name of the sampler variable.
         * @param postProcess Post process to get the output texture from.
         */
        setTextureFromPostProcessOutput(channel: string, postProcess: Nullable<PostProcess>): void;
    }
}

/**
 * Sets a texture to be the input of the specified post process. (To use the output, pass in the next post process in the pipeline)
 * @param channel Name of the sampler variable.
 * @param postProcess Post process to get the input texture from.
 */
Effect.prototype.setTextureFromPostProcess = function (channel: string, postProcess: Nullable<PostProcess>): void {
    this._engine.setTextureFromPostProcess(this._samplers[channel], postProcess, channel);
};

/**
 * (Warning! setTextureFromPostProcessOutput may be desired instead)
 * Sets the input texture of the passed in post process to be input of this effect. (To use the output of the passed in post process use setTextureFromPostProcessOutput)
 * @param channel Name of the sampler variable.
 * @param postProcess Post process to get the output texture from.
 */
Effect.prototype.setTextureFromPostProcessOutput = function (channel: string, postProcess: Nullable<PostProcess>): void {
    this._engine.setTextureFromPostProcessOutput(this._samplers[channel], postProcess, channel);
};

/**
 * Options for the PostProcess constructor
 */
export type PostProcessOptions = EffectWrapperCreationOptions & {
    /**
     * The width of the texture created for this post process.
     * This parameter (and height) is only used when passing a value for the 5th parameter (options) to the PostProcess constructor function.
     * If you use a PostProcessOptions for the 3rd parameter of the constructor, size is used instead of width and height.
     */
    width?: number;
    /**
     * The height of the texture created for this post process.
     * This parameter (and width) is only used when passing a value for the 5th parameter (options) to the PostProcess constructor function.
     * If you use a PostProcessOptions for the 3rd parameter of the constructor, size is used instead of width and height.
     */
    height?: number;

    /**
     * The size of the post process texture.
     * It is either a ratio to downscale or upscale the texture create for this post process, or an object containing width and height values.
     * Default: 1
     */
    size?: number | { width: number; height: number };
    /**
     * The camera that the post process will be attached to (default: null)
     */
    camera?: Nullable<Camera>;
    /**
     * The sampling mode to be used by the shader (default: Constants.TEXTURE_NEAREST_SAMPLINGMODE)
     */
    samplingMode?: number;
    /**
     * The engine to be used to render the post process (default: engine from scene)
     */
    engine?: AbstractEngine;
    /**
     * If the post process can be reused on the same frame. (default: false)
     */
    reusable?: boolean;
    /**
     * Type of the texture created for this post process (default: Constants.TEXTURETYPE_UNSIGNED_BYTE)
     */
    textureType?: number;
    /**
     * Format of the texture created for this post process (default: TEXTUREFORMAT_RGBA)
     */
    textureFormat?: number;
    /**
     * The effect wrapper instance used by the post process. If not provided, a new one will be created.
     */
    effectWrapper?: EffectWrapper;
};

type TextureCache = { texture: RenderTargetWrapper; postProcessChannel: number; lastUsedRenderId: number };

/**
 * PostProcess can be used to apply a shader to a texture after it has been rendered
 * See https://doc.babylonjs.com/features/featuresDeepDive/postProcesses/usePostProcesses
 */
export class PostProcess {
    /**
     * Force all the postprocesses to compile to glsl even on WebGPU engines.
     * False by default. This is mostly meant for backward compatibility.
     */
    public static get ForceGLSL(): boolean {
        return EffectWrapper.ForceGLSL;
    }

    public static set ForceGLSL(force: boolean) {
        EffectWrapper.ForceGLSL = force;
    }

    /** @internal */
    public _parentContainer: Nullable<IAssetContainer> = null;

    /**
     * Registers a shader code processing with a post process name.
     * @param postProcessName name of the post process. Use null for the fallback shader code processing. This is the shader code processing that will be used in case no specific shader code processing has been associated to a post process name
     * @param customShaderCodeProcessing shader code processing to associate to the post process name
     */
    public static RegisterShaderCodeProcessing(postProcessName: Nullable<string>, customShaderCodeProcessing?: EffectWrapperCustomShaderCodeProcessing) {
        EffectWrapper.RegisterShaderCodeProcessing(postProcessName, customShaderCodeProcessing);
    }

    /**
     * Gets or sets the unique id of the post process
     */
    @serialize()
    public uniqueId: number;

    /** Name of the PostProcess. */
    @serialize()
    public get name() {
        return this._effectWrapper.name;
    }

    public set name(value: string) {
        this._effectWrapper.name = value;
    }

    /**
     * Width of the texture to apply the post process on
     */
    @serialize()
    public width = -1;

    /**
     * Height of the texture to apply the post process on
     */
    @serialize()
    public height = -1;

    /**
     * Gets the node material used to create this postprocess (null if the postprocess was manually created)
     */
    public nodeMaterialSource: Nullable<NodeMaterial> = null;

    /**
     * Internal, reference to the location where this postprocess was output to. (Typically the texture on the next postprocess in the chain)
     * @internal
     */
    public _outputTexture: Nullable<RenderTargetWrapper> = null;
    /**
     * Sampling mode used by the shader
     */
    @serialize()
    public renderTargetSamplingMode: number;
    /**
     * Clear color to use when screen clearing
     */
    @serializeAsColor4()
    public clearColor: Color4;
    /**
     * If the buffer needs to be cleared before applying the post process. (default: true)
     * Should be set to false if shader will overwrite all previous pixels.
     */
    @serialize()
    public autoClear = true;
    /**
     * If clearing the buffer should be forced in autoClear mode, even when alpha mode is enabled (default: false).
     * By default, the buffer will only be cleared if alpha mode is disabled (and autoClear is true).
     */
    @serialize()
    public forceAutoClearInAlphaMode = false;

    /**
     * Type of alpha mode to use when performing the post process (default: Engine.ALPHA_DISABLE)
     */
    @serialize()
    public get alphaMode() {
        return this._effectWrapper.alphaMode;
    }

    public set alphaMode(value: number) {
        this._effectWrapper.alphaMode = value;
    }

    /**
     * Sets the setAlphaBlendConstants of the babylon engine
     */
    @serialize()
    public alphaConstants: Color4;

    /**
     * Animations to be used for the post processing
     */
    public animations: Animation[] = [];

    /**
     * Enable Pixel Perfect mode where texture is not scaled to be power of 2.
     * Can only be used on a single postprocess or on the last one of a chain. (default: false)
     */
    @serialize()
    public enablePixelPerfectMode = false;

    /**
     * Force the postprocess to be applied without taking in account viewport
     */
    @serialize()
    public forceFullscreenViewport = true;

    /**
     * List of inspectable custom properties (used by the Inspector)
     * @see https://doc.babylonjs.com/toolsAndResources/inspector#extensibility
     */
    public inspectableCustomProperties: IInspectable[];

    /**
     * Scale mode for the post process (default: Engine.SCALEMODE_FLOOR)
     *
     * | Value | Type                                | Description |
     * | ----- | ----------------------------------- | ----------- |
     * | 1     | SCALEMODE_FLOOR                     | [engine.scalemode_floor](https://doc.babylonjs.com/api/classes/babylon.engine#scalemode_floor) |
     * | 2     | SCALEMODE_NEAREST                   | [engine.scalemode_nearest](https://doc.babylonjs.com/api/classes/babylon.engine#scalemode_nearest) |
     * | 3     | SCALEMODE_CEILING                   | [engine.scalemode_ceiling](https://doc.babylonjs.com/api/classes/babylon.engine#scalemode_ceiling) |
     *
     */
    @serialize()
    public scaleMode = Constants.SCALEMODE_FLOOR;
    /**
     * Force textures to be a power of two (default: false)
     */
    @serialize()
    public alwaysForcePOT = false;

    @serialize("samples")
    private _samples = 1;

    /**
     * Number of sample textures (default: 1)
     */
    public get samples() {
        return this._samples;
    }

    public set samples(n: number) {
        this._samples = Math.min(n, this._engine.getCaps().maxMSAASamples);

        this._textures.forEach((texture) => {
            texture.setSamples(this._samples);
        });
    }

    /**
     * Modify the scale of the post process to be the same as the viewport (default: false)
     */
    @serialize()
    public adaptScaleToCurrentViewport = false;

    private _camera: Camera;
    protected _scene: Scene;
    private _engine: AbstractEngine;

    protected _webGPUReady = false;

    private _options: number | { width: number; height: number };
    private _reusable = false;
    private _renderId = 0;
    private _textureType: number;
    private _textureFormat: number;
    /** @internal */
    private _shaderLanguage: ShaderLanguage;

    /**
     * Gets the shader language type used to generate vertex and fragment source code.
     */
    public get shaderLanguage(): ShaderLanguage {
        return this._shaderLanguage;
    }

    /**
     * if externalTextureSamplerBinding is true, the "apply" method won't bind the textureSampler texture, it is expected to be done by the "outside" (by the onApplyObservable observer most probably).
     * counter-productive in some cases because if the texture bound by "apply" is different from the currently texture bound, (the one set by the onApplyObservable observer, for eg) some
     * internal structures (materialContext) will be dirtified, which may impact performances
     */
    public externalTextureSamplerBinding = false;

    /**
     * Smart array of input and output textures for the post process.
     * @internal
     */
    public _textures = new SmartArray<RenderTargetWrapper>(2);
    /**
     * Smart array of input and output textures for the post process.
     * @internal
     */
    private _textureCache: TextureCache[] = [];
    /**
     * The index in _textures that corresponds to the output texture.
     * @internal
     */
    public _currentRenderTextureInd = 0;
    private _samplers: string[];
    private _fragmentUrl: string;
    private _vertexUrl: string;
    private _parameters: string[];
    private _uniformBuffers: string[];
    protected _postProcessDefines: Nullable<string>;
    private _scaleRatio = new Vector2(1, 1);
    protected _indexParameters: any;
    private _shareOutputWithPostProcess: Nullable<PostProcess>;
    private _texelSize = Vector2.Zero();

    /** @internal */
    public _forcedOutputTexture: Nullable<RenderTargetWrapper>;

    /**
     * Prepass configuration in case this post process needs a texture from prepass
     * @internal
     */
    public _prePassEffectConfiguration: PrePassEffectConfiguration;

    /**
     * Returns the fragment url or shader name used in the post process.
     * @returns the fragment url or name in the shader store.
     */
    public getEffectName(): string {
        return this._fragmentUrl;
    }

    /**
     * Executed when the effect was created
     * @returns effect that was created for this post process
     */
    public onEffectCreatedObservable;

    // Events

    /**
     * An event triggered when the postprocess is activated.
     */
    public onActivateObservable = new Observable<Camera>();

    private _onActivateObserver: Nullable<Observer<Camera>>;
    /**
     * A function that is added to the onActivateObservable
     */
    public set onActivate(callback: Nullable<(camera: Camera) => void>) {
        if (this._onActivateObserver) {
            this.onActivateObservable.remove(this._onActivateObserver);
        }
        if (callback) {
            this._onActivateObserver = this.onActivateObservable.add(callback);
        }
    }

    /**
     * An event triggered when the postprocess changes its size.
     */
    public onSizeChangedObservable = new Observable<PostProcess>();

    private _onSizeChangedObserver: Nullable<Observer<PostProcess>>;
    /**
     * A function that is added to the onSizeChangedObservable
     */
    public set onSizeChanged(callback: (postProcess: PostProcess) => void) {
        if (this._onSizeChangedObserver) {
            this.onSizeChangedObservable.remove(this._onSizeChangedObserver);
        }
        this._onSizeChangedObserver = this.onSizeChangedObservable.add(callback);
    }

    /**
     * An event triggered when the postprocess applies its effect.
     */
    public onApplyObservable = new Observable<Effect>();

    private _onApplyObserver: Nullable<Observer<Effect>>;
    /**
     * A function that is added to the onApplyObservable
     */
    public set onApply(callback: (effect: Effect) => void) {
        if (this._onApplyObserver) {
            this.onApplyObservable.remove(this._onApplyObserver);
        }
        this._onApplyObserver = this.onApplyObservable.add(callback);
    }

    /**
     * An event triggered before rendering the postprocess
     */
    public onBeforeRenderObservable = new Observable<Effect>();

    private _onBeforeRenderObserver: Nullable<Observer<Effect>>;
    /**
     * A function that is added to the onBeforeRenderObservable
     */
    public set onBeforeRender(callback: (effect: Effect) => void) {
        if (this._onBeforeRenderObserver) {
            this.onBeforeRenderObservable.remove(this._onBeforeRenderObserver);
        }
        this._onBeforeRenderObserver = this.onBeforeRenderObservable.add(callback);
    }

    /**
     * An event triggered after rendering the postprocess
     */
    public onAfterRenderObservable = new Observable<Effect>();

    private _onAfterRenderObserver: Nullable<Observer<Effect>>;
    /**
     * A function that is added to the onAfterRenderObservable
     */
    public set onAfterRender(callback: (efect: Effect) => void) {
        if (this._onAfterRenderObserver) {
            this.onAfterRenderObservable.remove(this._onAfterRenderObserver);
        }
        this._onAfterRenderObserver = this.onAfterRenderObservable.add(callback);
    }

    /**
     * An event triggered when the post-process is disposed
     */
    public readonly onDisposeObservable = new Observable<void>();

    /**
     * The input texture for this post process and the output texture of the previous post process. When added to a pipeline the previous post process will
     * render it's output into this texture and this texture will be used as textureSampler in the fragment shader of this post process.
     */
    public get inputTexture(): RenderTargetWrapper {
        return this._textures.data[this._currentRenderTextureInd];
    }

    public set inputTexture(value: RenderTargetWrapper) {
        this._forcedOutputTexture = value;
    }

    /**
     * Since inputTexture should always be defined, if we previously manually set `inputTexture`,
     * the only way to unset it is to use this function to restore its internal state
     */
    public restoreDefaultInputTexture() {
        if (this._forcedOutputTexture) {
            this._forcedOutputTexture = null;
            this.markTextureDirty();
        }
    }

    /**
     * Gets the camera which post process is applied to.
     * @returns The camera the post process is applied to.
     */
    public getCamera(): Camera {
        return this._camera;
    }

    /**
     * Gets the texel size of the postprocess.
     * See https://en.wikipedia.org/wiki/Texel_(graphics)
     */
    public get texelSize(): Vector2 {
        if (this._shareOutputWithPostProcess) {
            return this._shareOutputWithPostProcess.texelSize;
        }

        if (this._forcedOutputTexture) {
            this._texelSize.copyFromFloats(1.0 / this._forcedOutputTexture.width, 1.0 / this._forcedOutputTexture.height);
        }

        return this._texelSize;
    }

    protected readonly _effectWrapper: EffectWrapper;
    protected readonly _useExistingThinPostProcess: boolean;

    /**
     * Creates a new instance PostProcess
     * @param name The name of the PostProcess.
     * @param fragmentUrl The url of the fragment shader to be used.
     * @param options The options to be used when constructing the post process.
     */
    constructor(name: string, fragmentUrl: string, options?: PostProcessOptions);

    /**
     * Creates a new instance PostProcess
     * @param name The name of the PostProcess.
     * @param fragmentUrl The url of the fragment shader to be used.
     * @param parameters Array of the names of uniform non-sampler2D variables that will be passed to the shader.
     * @param samplers Array of the names of uniform sampler2D variables that will be passed to the shader.
     * @param options The required width/height ratio to downsize to before computing the render pass. (Use 1.0 for full size)
     * @param camera The camera to apply the render pass to.
     * @param samplingMode The sampling mode to be used when computing the pass. (default: 0)
     * @param engine The engine which the post process will be applied. (default: current engine)
     * @param reusable If the post process can be reused on the same frame. (default: false)
     * @param defines String of defines that will be set when running the fragment shader. (default: null)
     * @param textureType Type of textures used when performing the post process. (default: 0)
     * @param vertexUrl The url of the vertex shader to be used. (default: "postprocess")
     * @param indexParameters The index parameters to be used for babylons include syntax "#include<kernelBlurVaryingDeclaration>[0..varyingCount]". (default: undefined) See usage in babylon.blurPostProcess.ts and kernelBlur.vertex.fx
     * @param blockCompilation If the shader should not be compiled immediatly. (default: false)
     * @param textureFormat Format of textures used when performing the post process. (default: TEXTUREFORMAT_RGBA)
     * @param shaderLanguage The shader language of the shader. (default: GLSL)
     * @param extraInitializations Defines additional code to call to prepare the shader code
     */
    constructor(
        name: string,
        fragmentUrl: string,
        parameters: Nullable<string[]>,
        samplers: Nullable<string[]>,
        options: number | PostProcessOptions,
        camera: Nullable<Camera>,
        samplingMode?: number,
        engine?: AbstractEngine,
        reusable?: boolean,
        defines?: Nullable<string>,
        textureType?: number,
        vertexUrl?: string,
        indexParameters?: any,
        blockCompilation?: boolean,
        textureFormat?: number,
        shaderLanguage?: ShaderLanguage,
        extraInitializations?: (useWebGPU: boolean, list: Promise<any>[]) => void
    );

    /** @internal */
    constructor(
        name: string,
        fragmentUrl: string,
        parameters?: Nullable<string[]> | PostProcessOptions,
        samplers?: Nullable<string[]>,
        _size?: number | PostProcessOptions,
        camera?: Nullable<Camera>,
        samplingMode: number = Constants.TEXTURE_NEAREST_SAMPLINGMODE,
        engine?: AbstractEngine,
        reusable?: boolean,
        defines: Nullable<string> = null,
        textureType: number = Constants.TEXTURETYPE_UNSIGNED_BYTE,
        vertexUrl: string = "postprocess",
        indexParameters?: any,
        blockCompilation = false,
        textureFormat = Constants.TEXTUREFORMAT_RGBA,
        shaderLanguage?: ShaderLanguage,
        extraInitializations?: (useWebGPU: boolean, list: Promise<any>[]) => void
    ) {
        let size: number | { width: number; height: number } = 1;
        let uniformBuffers: Nullable<string[]> = null;
        let effectWrapper: EffectWrapper | undefined;
        if (parameters && !Array.isArray(parameters)) {
            const options = parameters;
            parameters = options.uniforms ?? null;
            samplers = options.samplers ?? null;
            size = options.size ?? 1;
            camera = options.camera ?? null;
            samplingMode = options.samplingMode ?? Constants.TEXTURE_NEAREST_SAMPLINGMODE;
            engine = options.engine;
            reusable = options.reusable;
            defines = Array.isArray(options.defines) ? options.defines.join("\n") : (options.defines ?? null);
            textureType = options.textureType ?? Constants.TEXTURETYPE_UNSIGNED_BYTE;
            vertexUrl = options.vertexUrl ?? "postprocess";
            indexParameters = options.indexParameters;
            blockCompilation = options.blockCompilation ?? false;
            textureFormat = options.textureFormat ?? Constants.TEXTUREFORMAT_RGBA;
            shaderLanguage = options.shaderLanguage ?? ShaderLanguage.GLSL;
            uniformBuffers = options.uniformBuffers ?? null;
            extraInitializations = options.extraInitializations;
            effectWrapper = options.effectWrapper;
        } else if (_size) {
            if (typeof _size === "number") {
                size = _size;
            } else {
                size = { width: _size.width!, height: _size.height! };
            }
        }

        this._useExistingThinPostProcess = !!effectWrapper;

        this._effectWrapper =
            effectWrapper ??
            new EffectWrapper({
                name,
                useShaderStore: true,
                useAsPostProcess: true,
                fragmentShader: fragmentUrl,
                engine: engine || camera?.getScene().getEngine(),
                uniforms: parameters,
                samplers,
                uniformBuffers,
                defines,
                vertexUrl,
                indexParameters,
                blockCompilation: true,
                shaderLanguage,
                extraInitializations: undefined,
            });

        this.name = name;
        this.onEffectCreatedObservable = this._effectWrapper.onEffectCreatedObservable;

        if (camera != null) {
            this._camera = camera;
            this._scene = camera.getScene();
            camera.attachPostProcess(this);
            this._engine = this._scene.getEngine();

            this._scene.addPostProcess(this);
            this.uniqueId = this._scene.getUniqueId();
        } else if (engine) {
            this._engine = engine;
            this._engine.postProcesses.push(this);
        }

        this._options = size;
        this.renderTargetSamplingMode = samplingMode ? samplingMode : Constants.TEXTURE_NEAREST_SAMPLINGMODE;
        this._reusable = reusable || false;
        this._textureType = textureType;
        this._textureFormat = textureFormat;
        this._shaderLanguage = shaderLanguage || ShaderLanguage.GLSL;

        this._samplers = samplers || [];
        if (this._samplers.indexOf("textureSampler") === -1) {
            this._samplers.push("textureSampler");
        }

        this._fragmentUrl = fragmentUrl;
        this._vertexUrl = vertexUrl;
        this._parameters = parameters || [];

        if (this._parameters.indexOf("scale") === -1) {
            this._parameters.push("scale");
        }
        this._uniformBuffers = uniformBuffers || [];

        this._indexParameters = indexParameters;

        if (!this._useExistingThinPostProcess) {
            this._webGPUReady = this._shaderLanguage === ShaderLanguage.WGSL;

            const importPromises: Array<Promise<any>> = [];

            this._gatherImports(this._engine.isWebGPU && !PostProcess.ForceGLSL, importPromises);

            this._effectWrapper._webGPUReady = this._webGPUReady;
            this._effectWrapper._postConstructor(blockCompilation, defines, extraInitializations, importPromises);
        }
    }

    protected _gatherImports(useWebGPU = false, list: Promise<any>[]) {
        // this._webGPUReady is used to detect when a postprocess is intended to be used with WebGPU
        if (useWebGPU && this._webGPUReady) {
            list.push(Promise.all([import("../ShadersWGSL/postprocess.vertex")]));
        } else {
            list.push(Promise.all([import("../Shaders/postprocess.vertex")]));
        }
    }

    /**
     * Gets a string identifying the name of the class
     * @returns "PostProcess" string
     */
    public getClassName(): string {
        return "PostProcess";
    }

    /**
     * Gets the engine which this post process belongs to.
     * @returns The engine the post process was enabled with.
     */
    public getEngine(): AbstractEngine {
        return this._engine;
    }

    /**
     * The effect that is created when initializing the post process.
     * @returns The created effect corresponding to the postprocess.
     */
    public getEffect(): Effect {
        return this._effectWrapper.drawWrapper.effect!;
    }

    /**
     * To avoid multiple redundant textures for multiple post process, the output the output texture for this post process can be shared with another.
     * @param postProcess The post process to share the output with.
     * @returns This post process.
     */
    public shareOutputWith(postProcess: PostProcess): PostProcess {
        this._disposeTextures();

        this._shareOutputWithPostProcess = postProcess;

        return this;
    }

    /**
     * Reverses the effect of calling shareOutputWith and returns the post process back to its original state.
     * This should be called if the post process that shares output with this post process is disabled/disposed.
     */
    public useOwnOutput() {
        if (this._textures.length == 0) {
            this._textures = new SmartArray<RenderTargetWrapper>(2);
        }

        this._shareOutputWithPostProcess = null;
    }

    /**
     * Updates the effect with the current post process compile time values and recompiles the shader.
     * @param defines Define statements that should be added at the beginning of the shader. (default: null)
     * @param uniforms Set of uniform variables that will be passed to the shader. (default: null)
     * @param samplers Set of Texture2D variables that will be passed to the shader. (default: null)
     * @param indexParameters The index parameters to be used for babylons include syntax "#include<kernelBlurVaryingDeclaration>[0..varyingCount]". (default: undefined) See usage in babylon.blurPostProcess.ts and kernelBlur.vertex.fx
     * @param onCompiled Called when the shader has been compiled.
     * @param onError Called if there is an error when compiling a shader.
     * @param vertexUrl The url of the vertex shader to be used (default: the one given at construction time)
     * @param fragmentUrl The url of the fragment shader to be used (default: the one given at construction time)
     */
    public updateEffect(
        defines: Nullable<string> = null,
        uniforms: Nullable<string[]> = null,
        samplers: Nullable<string[]> = null,
        indexParameters?: any,
        onCompiled?: (effect: Effect) => void,
        onError?: (effect: Effect, errors: string) => void,
        vertexUrl?: string,
        fragmentUrl?: string
    ) {
        this._effectWrapper.updateEffect(defines, uniforms, samplers, indexParameters, onCompiled, onError, vertexUrl, fragmentUrl);
        this._postProcessDefines = Array.isArray(this._effectWrapper.options.defines) ? this._effectWrapper.options.defines.join("\n") : this._effectWrapper.options.defines;
    }

    /**
     * The post process is reusable if it can be used multiple times within one frame.
     * @returns If the post process is reusable
     */
    public isReusable(): boolean {
        return this._reusable;
    }

    /** invalidate frameBuffer to hint the postprocess to create a depth buffer */
    public markTextureDirty(): void {
        this.width = -1;
    }

    private _createRenderTargetTexture(textureSize: { width: number; height: number }, textureOptions: RenderTargetCreationOptions, channel = 0) {
        for (let i = 0; i < this._textureCache.length; i++) {
            if (
                this._textureCache[i].texture.width === textureSize.width &&
                this._textureCache[i].texture.height === textureSize.height &&
                this._textureCache[i].postProcessChannel === channel &&
                this._textureCache[i].texture._generateDepthBuffer === textureOptions.generateDepthBuffer &&
                this._textureCache[i].texture.samples === textureOptions.samples
            ) {
                return this._textureCache[i].texture;
            }
        }

        const tex = this._engine.createRenderTargetTexture(textureSize, textureOptions);
        this._textureCache.push({ texture: tex, postProcessChannel: channel, lastUsedRenderId: -1 });

        return tex;
    }

    private _flushTextureCache() {
        const currentRenderId = this._renderId;

        for (let i = this._textureCache.length - 1; i >= 0; i--) {
            if (currentRenderId - this._textureCache[i].lastUsedRenderId > 100) {
                let currentlyUsed = false;
                for (let j = 0; j < this._textures.length; j++) {
                    if (this._textures.data[j] === this._textureCache[i].texture) {
                        currentlyUsed = true;
                        break;
                    }
                }

                if (!currentlyUsed) {
                    this._textureCache[i].texture.dispose();
                    this._textureCache.splice(i, 1);
                }
            }
        }
    }

    /**
     * Resizes the post-process texture
     * @param width Width of the texture
     * @param height Height of the texture
     * @param camera The camera this post-process is applied to. Pass null if the post-process is used outside the context of a camera post-process chain (default: null)
     * @param needMipMaps True if mip maps need to be generated after render (default: false)
     * @param forceDepthStencil True to force post-process texture creation with stencil depth and buffer (default: false)
     */
    public resize(width: number, height: number, camera: Nullable<Camera> = null, needMipMaps = false, forceDepthStencil = false) {
        if (this._textures.length > 0) {
            this._textures.reset();
        }

        this.width = width;
        this.height = height;

        let firstPP = null;
        if (camera) {
            for (let i = 0; i < camera._postProcesses.length; i++) {
                if (camera._postProcesses[i] !== null) {
                    firstPP = camera._postProcesses[i];
                    break;
                }
            }
        }

        const textureSize = { width: this.width, height: this.height };
        const textureOptions = {
            generateMipMaps: needMipMaps,
            generateDepthBuffer: forceDepthStencil || firstPP === this,
            generateStencilBuffer: (forceDepthStencil || firstPP === this) && this._engine.isStencilEnable,
            samplingMode: this.renderTargetSamplingMode,
            type: this._textureType,
            format: this._textureFormat,
            samples: this._samples,
            label: "PostProcessRTT-" + this.name,
        };

        this._textures.push(this._createRenderTargetTexture(textureSize, textureOptions, 0));

        if (this._reusable) {
            this._textures.push(this._createRenderTargetTexture(textureSize, textureOptions, 1));
        }

        this._texelSize.copyFromFloats(1.0 / this.width, 1.0 / this.height);

        this.onSizeChangedObservable.notifyObservers(this);
    }

    private _getTarget() {
        let target: RenderTargetWrapper;

        if (this._shareOutputWithPostProcess) {
            target = this._shareOutputWithPostProcess.inputTexture;
        } else if (this._forcedOutputTexture) {
            target = this._forcedOutputTexture;

            this.width = this._forcedOutputTexture.width;
            this.height = this._forcedOutputTexture.height;
        } else {
            target = this.inputTexture;

            let cache;
            for (let i = 0; i < this._textureCache.length; i++) {
                if (this._textureCache[i].texture === target) {
                    cache = this._textureCache[i];
                    break;
                }
            }

            if (cache) {
                cache.lastUsedRenderId = this._renderId;
            }
        }

        return target;
    }

    /**
     * Activates the post process by intializing the textures to be used when executed. Notifies onActivateObservable.
     * When this post process is used in a pipeline, this is call will bind the input texture of this post process to the output of the previous.
     * @param cameraOrScene The camera that will be used in the post process. This camera will be used when calling onActivateObservable. You can also pass the scene if no camera is available.
     * @param sourceTexture The source texture to be inspected to get the width and height if not specified in the post process constructor. (default: null)
     * @param forceDepthStencil If true, a depth and stencil buffer will be generated. (default: false)
     * @returns The render target wrapper that was bound to be written to.
     */
    public activate(cameraOrScene: Nullable<Camera> | Scene, sourceTexture: Nullable<InternalTexture> = null, forceDepthStencil?: boolean): RenderTargetWrapper {
        const camera = cameraOrScene === null || (cameraOrScene as Camera).cameraRigMode !== undefined ? (cameraOrScene as Camera) || this._camera : null;

        const scene = camera?.getScene() ?? (cameraOrScene as Scene);
        const engine = scene.getEngine();
        const maxSize = engine.getCaps().maxTextureSize;

        const requiredWidth = ((sourceTexture ? sourceTexture.width : this._engine.getRenderWidth(true)) * <number>this._options) | 0;
        const requiredHeight = ((sourceTexture ? sourceTexture.height : this._engine.getRenderHeight(true)) * <number>this._options) | 0;

        let desiredWidth = (<PostProcessOptions>this._options).width || requiredWidth;
        let desiredHeight = (<PostProcessOptions>this._options).height || requiredHeight;

        const needMipMaps =
            this.renderTargetSamplingMode !== Constants.TEXTURE_NEAREST_LINEAR &&
            this.renderTargetSamplingMode !== Constants.TEXTURE_NEAREST_NEAREST &&
            this.renderTargetSamplingMode !== Constants.TEXTURE_LINEAR_LINEAR;

        let target: Nullable<RenderTargetWrapper> = null;

        if (!this._shareOutputWithPostProcess && !this._forcedOutputTexture) {
            if (this.adaptScaleToCurrentViewport) {
                const currentViewport = engine.currentViewport;

                if (currentViewport) {
                    desiredWidth *= currentViewport.width;
                    desiredHeight *= currentViewport.height;
                }
            }

            if (needMipMaps || this.alwaysForcePOT) {
                if (!(<PostProcessOptions>this._options).width) {
                    desiredWidth = engine.needPOTTextures ? GetExponentOfTwo(desiredWidth, maxSize, this.scaleMode) : desiredWidth;
                }

                if (!(<PostProcessOptions>this._options).height) {
                    desiredHeight = engine.needPOTTextures ? GetExponentOfTwo(desiredHeight, maxSize, this.scaleMode) : desiredHeight;
                }
            }

            if (this.width !== desiredWidth || this.height !== desiredHeight || !(target = this._getTarget())) {
                this.resize(desiredWidth, desiredHeight, camera, needMipMaps, forceDepthStencil);
            }

            this._textures.forEach((texture) => {
                if (texture.samples !== this.samples) {
                    this._engine.updateRenderTargetTextureSampleCount(texture, this.samples);
                }
            });

            this._flushTextureCache();
            this._renderId++;
        }

        if (!target) {
            target = this._getTarget();
        }

        // Bind the input of this post process to be used as the output of the previous post process.
        if (this.enablePixelPerfectMode) {
            this._scaleRatio.copyFromFloats(requiredWidth / desiredWidth, requiredHeight / desiredHeight);
            this._engine.bindFramebuffer(target, 0, requiredWidth, requiredHeight, this.forceFullscreenViewport);
        } else {
            this._scaleRatio.copyFromFloats(1, 1);
            this._engine.bindFramebuffer(target, 0, undefined, undefined, this.forceFullscreenViewport);
        }

        this._engine._debugInsertMarker?.(`post process ${this.name} input`);

        this.onActivateObservable.notifyObservers(camera!);

        // Clear
        if (this.autoClear && (this.alphaMode === Constants.ALPHA_DISABLE || this.forceAutoClearInAlphaMode)) {
            this._engine.clear(this.clearColor ? this.clearColor : scene.clearColor, scene._allowPostProcessClearColor, true, true);
        }

        if (this._reusable) {
            this._currentRenderTextureInd = (this._currentRenderTextureInd + 1) % 2;
        }
        return target;
    }

    /**
     * If the post process is supported.
     */
    public get isSupported(): boolean {
        return this._effectWrapper.drawWrapper.effect!.isSupported;
    }

    /**
     * The aspect ratio of the output texture.
     */
    public get aspectRatio(): number {
        if (this._shareOutputWithPostProcess) {
            return this._shareOutputWithPostProcess.aspectRatio;
        }

        if (this._forcedOutputTexture) {
            return this._forcedOutputTexture.width / this._forcedOutputTexture.height;
        }
        return this.width / this.height;
    }

    /**
     * Get a value indicating if the post-process is ready to be used
     * @returns true if the post-process is ready (shader is compiled)
     */
    public isReady(): boolean {
        return this._effectWrapper.isReady();
    }

    /**
     * Binds all textures and uniforms to the shader, this will be run on every pass.
     * @returns the effect corresponding to this post process. Null if not compiled or not ready.
     */
    public apply(): Nullable<Effect> {
        // Check
        if (!this._effectWrapper.isReady()) {
            return null;
        }

        // States
        this._engine.enableEffect(this._effectWrapper.drawWrapper);
        this._engine.setState(false);
        this._engine.setDepthBuffer(false);
        this._engine.setDepthWrite(false);

        // Alpha
        if (this.alphaConstants) {
            this.getEngine().setAlphaConstants(this.alphaConstants.r, this.alphaConstants.g, this.alphaConstants.b, this.alphaConstants.a);
        }

        this._engine.setAlphaMode(this.alphaMode);

        // Bind the output texture of the preivous post process as the input to this post process.
        let source: RenderTargetWrapper;
        if (this._shareOutputWithPostProcess) {
            source = this._shareOutputWithPostProcess.inputTexture;
        } else if (this._forcedOutputTexture) {
            source = this._forcedOutputTexture;
        } else {
            source = this.inputTexture;
        }

        if (!this.externalTextureSamplerBinding) {
            this._effectWrapper.drawWrapper.effect!._bindTexture("textureSampler", source?.texture);
        }

        // Parameters
        this._effectWrapper.drawWrapper.effect!.setVector2("scale", this._scaleRatio);
        this.onApplyObservable.notifyObservers(this._effectWrapper.drawWrapper.effect!);

        this._effectWrapper.bind(true);

        return this._effectWrapper.drawWrapper.effect;
    }

    private _disposeTextures() {
        if (this._shareOutputWithPostProcess || this._forcedOutputTexture) {
            this._disposeTextureCache();
            return;
        }

        this._disposeTextureCache();
        this._textures.dispose();
    }

    private _disposeTextureCache() {
        for (let i = this._textureCache.length - 1; i >= 0; i--) {
            this._textureCache[i].texture.dispose();
        }

        this._textureCache.length = 0;
    }

    /**
     * Sets the required values to the prepass renderer.
     * @param prePassRenderer defines the prepass renderer to setup.
     * @returns true if the pre pass is needed.
     */
    public setPrePassRenderer(prePassRenderer: PrePassRenderer): boolean {
        if (this._prePassEffectConfiguration) {
            this._prePassEffectConfiguration = prePassRenderer.addEffectConfiguration(this._prePassEffectConfiguration);
            this._prePassEffectConfiguration.enabled = true;
            return true;
        }

        return false;
    }

    /**
     * Disposes the post process.
     * @param camera The camera to dispose the post process on.
     */
    public dispose(camera?: Camera): void {
        camera = camera || this._camera;

        if (!this._useExistingThinPostProcess) {
            this._effectWrapper.dispose();
        }

        this._disposeTextures();

        let index;
        if (this._scene) {
            index = this._scene.removePostProcess(this);
        }

        if (this._parentContainer) {
            const index = this._parentContainer.postProcesses.indexOf(this);
            if (index > -1) {
                this._parentContainer.postProcesses.splice(index, 1);
            }
            this._parentContainer = null;
        }

        index = this._engine.postProcesses.indexOf(this);
        if (index !== -1) {
            this._engine.postProcesses.splice(index, 1);
        }

        this.onDisposeObservable.notifyObservers();

        if (!camera) {
            return;
        }
        camera.detachPostProcess(this);

        index = camera._postProcesses.indexOf(this);
        if (index === 0 && camera._postProcesses.length > 0) {
            const firstPostProcess = this._camera._getFirstPostProcess();
            if (firstPostProcess) {
                firstPostProcess.markTextureDirty();
            }
        }

        this.onActivateObservable.clear();
        this.onAfterRenderObservable.clear();
        this.onApplyObservable.clear();
        this.onBeforeRenderObservable.clear();
        this.onSizeChangedObservable.clear();
        this.onEffectCreatedObservable.clear();
    }

    /**
     * Serializes the post process to a JSON object
     * @returns the JSON object
     */
    public serialize(): any {
        const serializationObject = SerializationHelper.Serialize(this);
        const camera = this.getCamera() || (this._scene && this._scene.activeCamera);
        serializationObject.customType = "BABYLON." + this.getClassName();
        serializationObject.cameraId = camera ? camera.id : null;
        serializationObject.reusable = this._reusable;
        serializationObject.textureType = this._textureType;
        serializationObject.fragmentUrl = this._fragmentUrl;
        serializationObject.parameters = this._parameters;
        serializationObject.samplers = this._samplers;
        serializationObject.uniformBuffers = this._uniformBuffers;
        serializationObject.options = this._options;
        serializationObject.defines = this._postProcessDefines;
        serializationObject.textureFormat = this._textureFormat;
        serializationObject.vertexUrl = this._vertexUrl;
        serializationObject.indexParameters = this._indexParameters;

        return serializationObject;
    }

    /**
     * Clones this post process
     * @returns a new post process similar to this one
     */
    public clone(): Nullable<PostProcess> {
        const serializationObject = this.serialize();
        serializationObject._engine = this._engine;
        serializationObject.cameraId = null;

        const result = PostProcess.Parse(serializationObject, this._scene, "");

        if (!result) {
            return null;
        }

        result.onActivateObservable = this.onActivateObservable.clone();
        result.onSizeChangedObservable = this.onSizeChangedObservable.clone();
        result.onApplyObservable = this.onApplyObservable.clone();
        result.onBeforeRenderObservable = this.onBeforeRenderObservable.clone();
        result.onAfterRenderObservable = this.onAfterRenderObservable.clone();

        result._prePassEffectConfiguration = this._prePassEffectConfiguration;

        return result;
    }

    /**
     * Creates a material from parsed material data
     * @param parsedPostProcess defines parsed post process data
     * @param scene defines the hosting scene
     * @param rootUrl defines the root URL to use to load textures
     * @returns a new post process
     */
    public static Parse(parsedPostProcess: any, scene: Scene, rootUrl: string): Nullable<PostProcess> {
        const postProcessType = GetClass(parsedPostProcess.customType);

        if (!postProcessType || !postProcessType._Parse) {
            return null;
        }

        const camera = scene ? scene.getCameraById(parsedPostProcess.cameraId) : null;
        return postProcessType._Parse(parsedPostProcess, camera, scene, rootUrl) as Nullable<PostProcess>;
    }

    /**
     * @internal
     */
    public static _Parse(parsedPostProcess: any, targetCamera: Nullable<Camera>, scene: Nullable<Scene>, rootUrl: string): Nullable<PostProcess> {
        return SerializationHelper.Parse(
            () => {
                return new PostProcess(
                    parsedPostProcess.name,
                    parsedPostProcess.fragmentUrl,
                    parsedPostProcess.parameters,
                    parsedPostProcess.samplers,
                    parsedPostProcess.options,
                    targetCamera,
                    parsedPostProcess.renderTargetSamplingMode,
                    parsedPostProcess._engine,
                    parsedPostProcess.reusable,
                    parsedPostProcess.defines,
                    parsedPostProcess.textureType,
                    parsedPostProcess.vertexUrl,
                    parsedPostProcess.indexParameters,
                    false,
                    parsedPostProcess.textureFormat
                );
            },
            parsedPostProcess,
            scene,
            rootUrl
        );
    }
}

RegisterClass("BABYLON.PostProcess", PostProcess);
