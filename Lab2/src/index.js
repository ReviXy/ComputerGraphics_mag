import { vec3, mat4 } from 'gl-matrix';

document.addEventListener('DOMContentLoaded', setup);

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2');
gl.viewport(0, 0, canvas.width, canvas.height);

let scale_pattern = 0.3;
const cameraPos = [0.0, 0.0, 5.0];
let translate = [0.0, 0.0, 0.0]
let rotation = [0.0, 0.0, 0.0]
let scale = [0.3, 0.3, 0.3]

let VBO;
let CBO;
let IBO;
let program, program_horizontal, program_diagonal, program_checkered;
let modelUniformID, modelUniformID_horizontal, modelUniformID_diagonal, modelUniformID_checkered;
let coordAttribID = 0, colorAttribID = 1;
let startTime;

const vertexShaderSource = `#version 300 es
    layout (location = 0) in vec3 position;
    layout (location = 1) in vec3 color;

    uniform mat4 model;

    out vec3 vColor;

    void main() {
        gl_Position = model * vec4(position, 1.0);
        vColor = color;
    }
`;

const fragmentShaderSource = `#version 300 es
    precision mediump float;

    in vec3 vColor;

    out vec4 color;

    void main() {
        color = vec4(vColor, 1.0f);
    }
`;

// --------------------------------------------------

const vertexShaderSource_pattern = `#version 300 es
    layout (location = 0) in vec3 position;

    uniform mat4 model;

    out vec3 modelPosition;

    void main() {
        gl_Position = model * vec4(position, 1.0);
        modelPosition = position;
    }
`;


const fragmentShaderSource_horizontal = `#version 300 es
    precision mediump float;

    in vec3 modelPosition;    
    out vec4 color;

    void main() {
        float k = 10.0f;
        if (int(mod(modelPosition.y * k + k, 2.0)) == 0){
            color = vec4(1.0f, 0.0f, 0.0f, 1.0f);
        } else{
            color = vec4(1.0f, 1.0f, 1.0f, 1.0f);
        }
    }
`;

const fragmentShaderSource_diagonal = `#version 300 es
    precision mediump float;

    in vec3 modelPosition;    
    out vec4 color;

    void main() {
        float k = 10.0f;
        if (int(mod((modelPosition.x + modelPosition.y) * k, 2.0)) == 0) {
            color = vec4(1.0, 0.0, 0.0, 1.0);
        } else {
            color = vec4(1.0, 1.0, 1.0, 1.0);
        }
    }
`;


const fragmentShaderSource_checkered = `#version 300 es
    precision mediump float;

    in vec3 modelPosition;    
    out vec4 color;

    void main() {
        float k = 5.0;
        float eps = 0.0001; // Маленькое смещение для избежания граничных артефактов
        
        int sum = int(floor(modelPosition.x * k + eps)) + 
                  int(floor(modelPosition.y * k + eps)) + 
                  int(floor(modelPosition.z * k + eps));
                  
        if (mod(float(sum), 2.0) == 0.0) {
            color = vec4(1.0, 0.0, 0.0, 1.0);
        }
        else {
            color = vec4(1.0, 1.0, 1.0, 1.0);
        }
    }
`;

function checkWebGLerror() {
    let err;
    while ((err = gl.getError()) != gl.NO_ERROR) {
        console.log("Error! Code: " + err);
    }
}

function shaderLog(shader) {
    const infoLog = gl.getShaderInfoLog(shader);
    if (infoLog && infoLog.length > 0) {
        console.log("Shader info log:", infoLog);
    }
}

function releaseVBO() {
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.deleteBuffer(VBO);
}

function releaseShader() {
    gl.useProgram(null);
    gl.deleteProgram(program);
}

function release() {
    releaseShader();
    releaseVBO();
}

function init() {
    initShaders();
    initVBO();

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clearDepth(1.0);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function initVBO() {
    VBO = gl.createBuffer();
    CBO = gl.createBuffer();
    IBO = gl.createBuffer();

    const vertices = new Float32Array([
        // front vertices (0-3)
        -1.0, -1.0, 1.0,
        -1.0, 1.0, 1.0,
        1.0, 1.0, 1.0,  
        1.0, -1.0, 1.0,
        
        // back vertices (4-7)
        -1.0, -1.0, -1.0,
        -1.0, 1.0, -1.0,
        1.0, 1.0, -1.0,
        1.0, -1.0, -1.0 
    ]);
    
    const indices = new Uint16Array([
        // Front face
        0, 1, 2,  0, 2, 3,
        
        // Back face
        4, 5, 6,  4, 6, 7,
        
        // Left face
        0, 1, 5,  0, 5, 4,
        
        // Right face
        2, 3, 7,  2, 7, 6,
        
        // Top face
        1, 2, 6,  1, 6, 5,
        
        // Bottom face
        0, 3, 7,  0, 7, 4
    ]);

    const colors = new Float32Array([
        1.0, 0.0, 0.0,
        0.0, 1.0, 0.0, 
        0.0, 0.0, 1.0,  
        1.0, 1.0, 0.0,  
        1.0, 0.0, 1.0,  
        0.0, 1.0, 1.0,
        1.0, 1.0, 1.0,
        0.5, 0.5, 0.5
    ]);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, CBO);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, IBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    
    checkWebGLerror();
}

function initShader(v, f){
    const vShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vShader, v);
    gl.compileShader(vShader);
    console.log("vertex shader");
    shaderLog(vShader);
    
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fShader, f);
    gl.compileShader(fShader);
    console.log("fragment shader");
    shaderLog(fShader);
    
    const res = gl.createProgram();
    gl.attachShader(res, vShader);
    gl.attachShader(res, fShader);
    gl.linkProgram(res);

    checkWebGLerror();
    return res;
}

function initShaders() {
    program = initShader(vertexShaderSource, fragmentShaderSource);
    program_horizontal = initShader(vertexShaderSource_pattern, fragmentShaderSource_horizontal);
    program_diagonal = initShader(vertexShaderSource_pattern, fragmentShaderSource_diagonal);
    program_checkered = initShader(vertexShaderSource_pattern, fragmentShaderSource_checkered);
    modelUniformID = gl.getUniformLocation(program, 'model');
    modelUniformID_horizontal = gl.getUniformLocation(program_horizontal, 'model');
    modelUniformID_diagonal = gl.getUniformLocation(program_diagonal, 'model');
    modelUniformID_checkered = gl.getUniformLocation(program_checkered, 'model');
    
    checkWebGLerror();
}

function draw() {
    const projection = mat4.create();
    const view = mat4.create();
    const model = mat4.create();
    
    mat4.perspective(projection, 45.0 * Math.PI / 180, canvas.width / canvas.height, 0.1, 100.0);
    mat4.identity(view);
    mat4.translate(view, view, [-cameraPos[0], -cameraPos[1], -cameraPos[2]]);
    
    // ------------------------------------------
    gl.useProgram(program_horizontal);
    mat4.multiply(model, projection, view);
    mat4.translate(model, model, translate);
    mat4.translate(model, model, [0, 0, 0]);
    mat4.rotate(model, model, rotation[2], [0, 0, 1]);
    mat4.rotate(model, model, rotation[1], [0, 1, 0]);
    mat4.rotate(model, model, rotation[0], [1, 0, 0]);
    mat4.scale(model, model, scale);
    
    gl.uniformMatrix4fv(modelUniformID_horizontal, false, model);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, IBO);
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.enableVertexAttribArray(coordAttribID);
    gl.vertexAttribPointer(coordAttribID, 3, gl.FLOAT, false, 0, 0);

    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

    // ------------------------------------------
    gl.useProgram(program_diagonal);
    mat4.multiply(model, projection, view);
    mat4.translate(model, model, translate);
    mat4.translate(model, model, [-1, 0, 0]);
    mat4.rotate(model, model, rotation[2], [0, 0, 1]);
    mat4.rotate(model, model, rotation[1], [0, 1, 0]);
    mat4.rotate(model, model, rotation[0], [1, 0, 0]);
    mat4.scale(model, model, scale);
    
    gl.uniformMatrix4fv(modelUniformID_diagonal, false, model);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, IBO);
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.enableVertexAttribArray(coordAttribID);
    gl.vertexAttribPointer(coordAttribID, 3, gl.FLOAT, false, 0, 0);

    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

    // ------------------------------------------
    gl.useProgram(program_checkered);
    mat4.multiply(model, projection, view);
    mat4.translate(model, model, translate);
    mat4.translate(model, model, [1, 0, 0]);
    mat4.rotate(model, model, rotation[2], [0, 0, 1]);
    mat4.rotate(model, model, rotation[1], [0, 1, 0]);
    mat4.rotate(model, model, rotation[0], [1, 0, 0]);
    mat4.scale(model, model, scale);
    
    gl.uniformMatrix4fv(modelUniformID_checkered, false, model);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, IBO);
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.enableVertexAttribArray(coordAttribID);
    gl.vertexAttribPointer(coordAttribID, 3, gl.FLOAT, false, 0, 0);
    
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

    // ------------------------------------------
    gl.useProgram(program);
    mat4.multiply(model, projection, view);
    mat4.translate(model, model, translate);
    mat4.translate(model, model, [0, -1, 0]);
    mat4.rotate(model, model, rotation[2], [0, 0, 1]);
    mat4.rotate(model, model, rotation[1], [0, 1, 0]);
    mat4.rotate(model, model, rotation[0], [1, 0, 0]);
    mat4.scale(model, model, scale);

    gl.uniformMatrix4fv(modelUniformID, false, model);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, IBO);
    gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
    gl.enableVertexAttribArray(coordAttribID);
    gl.vertexAttribPointer(coordAttribID, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, CBO);
    gl.enableVertexAttribArray(colorAttribID);
    gl.vertexAttribPointer(colorAttribID, 3, gl.FLOAT, false, 0, 0);
    
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);

    // ------------------------------------------

    gl.disableVertexAttribArray(coordAttribID);
    gl.disableVertexAttribArray(colorAttribID);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    gl.useProgram(null);
    
    checkWebGLerror();
}

function handleKeyboard() {
    if (keysPressed['Digit1']) {
        if (keysPressed['KeyX']) {
            if (keysPressed['ArrowLeft']) translate[0] -= 0.01;
            if (keysPressed['ArrowRight']) translate[0] += 0.01;
        }
        if (keysPressed['KeyY']) {
            if (keysPressed['ArrowLeft']) translate[1] -= 0.01;
            if (keysPressed['ArrowRight']) translate[1] += 0.01;
        }
        if (keysPressed['KeyZ']) {
            if (keysPressed['ArrowLeft']) translate[2] -= 0.01;
            if (keysPressed['ArrowRight']) translate[2] += 0.01;
        }
    }

    if (keysPressed['Digit2']) {
        if (keysPressed['KeyX']) {
            if (keysPressed['ArrowLeft']) rotation[0] -= 0.01;
            if (keysPressed['ArrowRight']) rotation[0] += 0.01;
        }
        if (keysPressed['KeyY']) {
            if (keysPressed['ArrowLeft']) rotation[1] -= 0.01;
            if (keysPressed['ArrowRight']) rotation[1] += 0.01;
        }
        if (keysPressed['KeyZ']) {
            if (keysPressed['ArrowLeft']) rotation[2] -= 0.01;
            if (keysPressed['ArrowRight']) rotation[2] += 0.01;
        }
    }

    if (keysPressed['Digit3']) {
        if (keysPressed['KeyX']) {
            if (keysPressed['ArrowLeft']) scale[0] -= 0.01;
            if (keysPressed['ArrowRight']) scale[0] += 0.01;
        }
        if (keysPressed['KeyY']) {
            if (keysPressed['ArrowLeft']) scale[1] -= 0.01;
            if (keysPressed['ArrowRight']) scale[1] += 0.01;
        }
        if (keysPressed['KeyZ']) {
            if (keysPressed['ArrowLeft']) scale[2] -= 0.01;
            if (keysPressed['ArrowRight']) scale[2] += 0.01;
        }
    }
}

const keysPressed = {};
document.addEventListener('keydown', (event) => {
    console.log(event.code);
    keysPressed[event.code] = true;
    if (event.code.startsWith('Digit') || event.code.startsWith('Arrow')) {
        event.preventDefault();
    }
});

document.addEventListener('keyup', (event) => {
    keysPressed[event.code] = false;
});

function setup() {
    init();
    //window.addEventListener('beforeunload', release);
    startTime = performance.now();

    function animate() {
        handleKeyboard();
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        draw();
        requestAnimationFrame(animate);
    }
    
    animate();
}