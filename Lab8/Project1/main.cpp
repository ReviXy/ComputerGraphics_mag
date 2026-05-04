#include <GL/glew.h>
#include <SFML/Graphics.hpp>
#include <SFML/OpenGL.hpp>
#include <SFML/Window.hpp>
#include <SOIL/SOIL.h>
#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <cmath>
#include <random>
#include <vector>

#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>

using namespace std;

GLuint Program;
GLuint ProgramNormals;
GLint coordAttribID;
GLint modelUniformID;
GLint viewUniformID;
GLint projUniformID;
GLint heightMapUniformID;
GLint tessLevelUniformID;
GLint cameraPosUniformID;

GLuint VAO, VBO, EBO;
GLuint heightMapTexture;

glm::vec3 cameraPos = glm::vec3(0.0f, 5.0f, 0.0f);
glm::vec3 cameraFront = glm::vec3(1.0f, 0.0f, 0.0f);
glm::vec3 cameraUp = glm::vec3(0.0f, 1.0f, 0.0f);
float yaw = -90.0f;
float pitch = -20.0f;
float lastX = 400, lastY = 300;
bool firstMouse = true;
bool isMousePressed = false;
sf::Vector2i lastMousePos;

bool showNormals = false;

const char* LandscapeVertexShader = R"(
#version 410 core
layout (location = 0) in vec3 position;
out vec3 WorldPos;
uniform mat4 model;
void main() {
    WorldPos = vec3(model * vec4(position, 1.0));
    gl_Position = vec4(position, 1.0);
}
)";

const char* LandscapeTessControl = R"(
#version 410 core
layout (vertices = 3) out;

uniform vec3 cameraPos;
uniform float maxTessLevel = 32.0;
uniform float minTessLevel = 2.0;
uniform float maxDistance = 30.0;
uniform float minDistance = 5.0;

in vec3 WorldPos[];
out vec3 WorldPosTCS[];

vec3 temp[3];

void main() {
    if (gl_InvocationID == 0) {
        temp[0] = vec3(0.0);
        temp[1] = vec3(0.0);
        temp[2] = vec3(0.0);
    }

    temp[gl_InvocationID] = WorldPos[gl_InvocationID];
    barrier();

    if (gl_InvocationID == 0) {
        vec3 center = (temp[0] + temp[1] + temp[2]) / 3.0;
        float distance = distance(cameraPos, center);
        
        float level;
        if (distance >= maxDistance) {
            level = minTessLevel;
        } else if (distance <= minDistance) {
            level = maxTessLevel;
        } else {
            float t = (maxDistance - distance) / (maxDistance - minDistance);
            level = minTessLevel + t * (maxTessLevel - minTessLevel);
        }
        
        gl_TessLevelOuter[0] = level;
        gl_TessLevelOuter[1] = level;
        gl_TessLevelOuter[2] = level;
        gl_TessLevelInner[0] = level;
    }

    WorldPosTCS[gl_InvocationID] = WorldPos[gl_InvocationID];
}
)";

const char* LandscapeTessEval = R"(
#version 410 core
layout (triangles, fractional_even_spacing, ccw) in;

uniform sampler2D heightMap;
uniform mat4 model;
uniform mat4 view;
uniform mat4 proj;

in vec3 WorldPosTCS[];
out vec3 WorldPosTES;
out vec2 TexCoordTES;
out vec3 NormalTES;

float getHeight(float x, float z) {
    vec2 texCoord = vec2(x * 0.1, z * 0.1);
    return texture(heightMap, texCoord).r * 2.0;
}

vec3 computeNormal(float x, float z) {
    float eps = 0.05;
    float h = getHeight(x, z);
    float hx = getHeight(x + eps, z);
    float hz = getHeight(x, z + eps);
    
    vec3 dx = vec3(eps, (hx - h), 0.0);
    vec3 dz = vec3(0.0, (hz - h), eps);
    
    vec3 normal = normalize(cross(dz, dx));
    return normal;
}

void main() {
    float u = gl_TessCoord.x;
    float v = gl_TessCoord.y;
    float w = gl_TessCoord.z;
    
    vec3 pos = u * WorldPosTCS[0] + v * WorldPosTCS[1] + w * WorldPosTCS[2];
    
    TexCoordTES = vec2(pos.x * 0.1, pos.z * 0.1);
    
    float height = texture(heightMap, TexCoordTES).r;
    pos.y = height * 2.0;

    // Вычисляем нормаль в интерполированной позиции
    NormalTES = computeNormal(pos.x, pos.z);
    
    WorldPosTES = pos;
    gl_Position = proj * view * model * vec4(pos, 1.0);
}
)";

const char* LandscapeFragShader = R"(
#version 410 core
in vec3 WorldPosTES;
in vec2 TexCoordTES;

out vec4 color;

uniform sampler2D heightMap;

void main() {
    float height = texture(heightMap, TexCoordTES).r;

    vec3 colorLow = vec3(0.2, 0.4, 0.1);
    vec3 colorMid = vec3(0.6, 0.5, 0.3);
    vec3 colorHigh = vec3(0.9, 0.9, 0.9);

    vec3 finalColor;
    if (height < 0.4)
        finalColor = mix(colorLow, colorMid, height / 0.4);
    else if (height < 0.9)
        finalColor = mix(colorMid, colorHigh, (height - 0.4) / 0.5);
    else
        finalColor = colorHigh;

    color = vec4(finalColor, 1.0);
}
)";

const char* NormalGeometryShader = R"(
#version 410 core
layout (triangles) in;
layout (line_strip, max_vertices = 6) out;

uniform mat4 model;
uniform mat4 view;
uniform mat4 proj;

in vec3 NormalTES[];
in vec3 WorldPosTES[];

void main() {
    vec3 center = (WorldPosTES[0] + WorldPosTES[1] + WorldPosTES[2]) / 3.0;
    
    vec3 centerWorld = vec3(model * vec4(center, 1.0));
    
    vec3 normal = normalize(NormalTES[0] + NormalTES[1] + NormalTES[2]);
    vec3 normalWorld = normalize(mat3(transpose(inverse(model))) * normal);

    for (int i = 0; i < 3; i++) {
        vec3 posWorld = vec3(model * vec4(WorldPosTES[i], 1.0));
        gl_Position = proj * view * vec4(posWorld, 1.0);
        EmitVertex();
    }
    EndPrimitive();
    
    gl_Position = proj * view * vec4(centerWorld, 1.0);
    EmitVertex();
    gl_Position = proj * view * vec4(centerWorld + normalWorld * 0.5, 1.0);
    EmitVertex();
    EndPrimitive();
}
)";

const char* normalFragShader = R"(
#version 410 core
out vec4 color;
void main() {
    color = vec4(1.0, 0.0, 0.0, 1.0);
}
)";

void checkOpenGLerror() {
    GLenum err;
    while ((err = glGetError()) != GL_NO_ERROR) {
        std::cout << "OpenGL Error: " << std::hex << err << std::dec << std::endl;
    }
}

void ShaderLog(unsigned int shader) {
    int infologLen = 0;
    glGetShaderiv(shader, GL_INFO_LOG_LENGTH, &infologLen);
    if (infologLen > 1) {
        int charsWritten = 0;
        std::vector<char> infoLog(infologLen);
        glGetShaderInfoLog(shader, infologLen, &charsWritten, infoLog.data());
        std::cout << "Shader InfoLog: " << infoLog.data() << std::endl;
    }
}

GLuint CreateShaderProgram() {
    GLuint vShader = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vShader, 1, &LandscapeVertexShader, NULL);
    glCompileShader(vShader);
    ShaderLog(vShader);

    GLuint tcsShader = glCreateShader(GL_TESS_CONTROL_SHADER);
    glShaderSource(tcsShader, 1, &LandscapeTessControl, NULL);
    glCompileShader(tcsShader);
    ShaderLog(tcsShader);

    GLuint tesShader = glCreateShader(GL_TESS_EVALUATION_SHADER);
    glShaderSource(tesShader, 1, &LandscapeTessEval, NULL);
    glCompileShader(tesShader);
    ShaderLog(tesShader);

    GLuint fShader = glCreateShader(GL_FRAGMENT_SHADER);
    glShaderSource(fShader, 1, &LandscapeFragShader, NULL);
    glCompileShader(fShader);
    ShaderLog(fShader);

    GLuint program = glCreateProgram();
    glAttachShader(program, vShader);
    glAttachShader(program, tcsShader);
    glAttachShader(program, tesShader);
    glAttachShader(program, fShader);
    glLinkProgram(program);

    int link_ok;
    glGetProgramiv(program, GL_LINK_STATUS, &link_ok);
    if (!link_ok) {
        std::cout << "Failed to link shader program" << std::endl;
        return 0;
    }

    glDeleteShader(vShader);
    glDeleteShader(tcsShader);
    glDeleteShader(tesShader);
    glDeleteShader(fShader);

    return program;
}

GLuint CreateNormalShaderProgram() {
    GLuint vShader = glCreateShader(GL_VERTEX_SHADER);
    glShaderSource(vShader, 1, &LandscapeVertexShader, NULL);
    glCompileShader(vShader);
    ShaderLog(vShader);

    GLuint tcsShader = glCreateShader(GL_TESS_CONTROL_SHADER);
    glShaderSource(tcsShader, 1, &LandscapeTessControl, NULL);
    glCompileShader(tcsShader);
    ShaderLog(tcsShader);

    GLuint tesShader = glCreateShader(GL_TESS_EVALUATION_SHADER);
    glShaderSource(tesShader, 1, &LandscapeTessEval, NULL);
    glCompileShader(tesShader);
    ShaderLog(tesShader);

    GLuint gShader = glCreateShader(GL_GEOMETRY_SHADER);
    glShaderSource(gShader, 1, &NormalGeometryShader, NULL);
    glCompileShader(gShader);
    ShaderLog(gShader);

    GLuint fShader = glCreateShader(GL_FRAGMENT_SHADER);
    
    glShaderSource(fShader, 1, &normalFragShader, NULL);
    glCompileShader(fShader);
    ShaderLog(fShader);

    GLuint program = glCreateProgram();
    glAttachShader(program, vShader);
    glAttachShader(program, tcsShader);
    glAttachShader(program, tesShader);
    glAttachShader(program, gShader);
    glAttachShader(program, fShader);
    glLinkProgram(program);

    int link_ok;
    glGetProgramiv(program, GL_LINK_STATUS, &link_ok);
    if (!link_ok) {
        std::cout << "Failed to link normal shader program" << std::endl;
        return 0;
    }

    glDeleteShader(vShader);
    glDeleteShader(tcsShader);
    glDeleteShader(tesShader);
    glDeleteShader(gShader);
    glDeleteShader(fShader);

    return program;
}

void InitTextures() {
    int width, height;
    unsigned char* image;

    glGenTextures(1, &heightMapTexture);
    glBindTexture(GL_TEXTURE_2D, heightMapTexture);

    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);

    image = SOIL_load_image("noiseTexture.png", &width, &height, 0, SOIL_LOAD_RGB);
    if (image) {
        std::cout << SOIL_last_result() << std::endl;
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB, width, height, 0, GL_RGB, GL_UNSIGNED_BYTE, image);
        glGenerateMipmap(GL_TEXTURE_2D);
        SOIL_free_image_data(image);
    }

    glBindTexture(GL_TEXTURE_2D, 0);
}

void InitPatch() {
    float vertices[] = {
        -5.0f, 0.0f, -5.0f,
         5.0f, 0.0f, -5.0f,
         5.0f, 0.0f,  5.0f,
        -5.0f, 0.0f,  5.0f
    };

    unsigned int indices[] = {
        0, 1, 2,
        0, 2, 3 
    };

    glGenVertexArrays(1, &VAO);
    glGenBuffers(1, &VBO);
    glGenBuffers(1, &EBO);

    glBindVertexArray(VAO);
    glBindBuffer(GL_ARRAY_BUFFER, VBO);
    glBufferData(GL_ARRAY_BUFFER, sizeof(vertices), vertices, GL_STATIC_DRAW);
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, EBO);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(indices), indices, GL_STATIC_DRAW);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(0);
    glBindVertexArray(0);
}

void Init() {
    Program = CreateShaderProgram();
    ProgramNormals = CreateNormalShaderProgram();

    if (Program == 0) {
        std::cout << "Failed to create shader program" << std::endl;
        exit(1);
    }

    coordAttribID = glGetAttribLocation(Program, "position");
    modelUniformID = glGetUniformLocation(Program, "model");
    viewUniformID = glGetUniformLocation(Program, "view");
    projUniformID = glGetUniformLocation(Program, "proj");
    heightMapUniformID = glGetUniformLocation(Program, "heightMap");
    tessLevelUniformID = glGetUniformLocation(Program, "maxTessLevel");
    cameraPosUniformID = glGetUniformLocation(Program, "cameraPos");

    InitTextures();
    InitPatch();

    glEnable(GL_DEPTH_TEST);
    glPatchParameteri(GL_PATCH_VERTICES, 3); 
    checkOpenGLerror();
}

void HandleInput(sf::Window& window) {
    const float cameraSpeed = 0.1f;

    glm::vec3 cameraRight = glm::normalize(glm::cross(cameraFront, cameraUp));
    glm::vec3 cameraForward = glm::normalize(glm::vec3(cameraFront.x, 0.0, cameraFront.z));

    if (sf::Keyboard::isKeyPressed(sf::Keyboard::Key::W)) {
        cameraPos += cameraSpeed * cameraForward;
    }
    if (sf::Keyboard::isKeyPressed(sf::Keyboard::Key::S)) {
        cameraPos -= cameraSpeed * cameraForward;
    }
    if (sf::Keyboard::isKeyPressed(sf::Keyboard::Key::A)) {
        cameraPos -= cameraSpeed * cameraRight;
    }
    if (sf::Keyboard::isKeyPressed(sf::Keyboard::Key::D)) {
        cameraPos += cameraSpeed * cameraRight;
    }
    if (sf::Keyboard::isKeyPressed(sf::Keyboard::Key::Space)) {
        cameraPos.y += cameraSpeed;
    }
    if (sf::Keyboard::isKeyPressed(sf::Keyboard::Key::LShift)) {
        cameraPos.y -= cameraSpeed;
    }
}

void MouseCallback(sf::Window& window) {
    if (!isMousePressed) return;

    sf::Vector2i mousePos = sf::Mouse::getPosition(window);

    if (firstMouse) {
        lastMousePos = mousePos;
        firstMouse = false;
    }

    float xoffset = mousePos.x - lastMousePos.x;
    float yoffset = lastMousePos.y - mousePos.y;
    lastMousePos = mousePos;

    const float sensitivity = 0.1f;
    xoffset *= sensitivity;
    yoffset *= sensitivity;

    yaw += xoffset;
    pitch += yoffset;

    if (pitch > 89.0f) pitch = 89.0f;
    if (pitch < -89.0f) pitch = -89.0f;

    glm::vec3 front;
    front.x = cos(glm::radians(yaw)) * cos(glm::radians(pitch));
    front.y = sin(glm::radians(pitch));
    front.z = sin(glm::radians(yaw)) * cos(glm::radians(pitch));
    cameraFront = glm::normalize(front);
}

void Draw() {
    glUseProgram(Program);

    glm::mat4 model = glm::mat4(1.0f);
    glm::mat4 view = glm::lookAt(cameraPos, cameraPos + cameraFront, cameraUp);
    glm::mat4 proj = glm::perspective(glm::radians(45.0f), 800.0f / 600.0f, 0.1f, 100.0f);

    glUniformMatrix4fv(modelUniformID, 1, GL_FALSE, glm::value_ptr(model));
    glUniformMatrix4fv(viewUniformID, 1, GL_FALSE, glm::value_ptr(view));
    glUniformMatrix4fv(projUniformID, 1, GL_FALSE, glm::value_ptr(proj));

    glUniform3fv(cameraPosUniformID, 1, glm::value_ptr(cameraPos));
    glUniform1f(tessLevelUniformID, 32.0f);

    glActiveTexture(GL_TEXTURE0);
    glBindTexture(GL_TEXTURE_2D, heightMapTexture);
    glUniform1i(heightMapUniformID, 0);

    glBindVertexArray(VAO);
    glDrawElements(GL_PATCHES, 6, GL_UNSIGNED_INT, 0);

    glBindVertexArray(0);
    glUseProgram(0);

    //-----------------------------------------------------
    if (showNormals) {
        glLineWidth(5.0f);

        glUseProgram(ProgramNormals);

        glm::mat4 model = glm::mat4(1.0f);
        glm::mat4 view = glm::lookAt(cameraPos, cameraPos + cameraFront, cameraUp);
        glm::mat4 proj = glm::perspective(glm::radians(45.0f), 800.0f / 600.0f, 0.1f, 100.0f);

        glUniformMatrix4fv(glGetUniformLocation(ProgramNormals, "model"), 1, GL_FALSE, glm::value_ptr(model));
        glUniformMatrix4fv(glGetUniformLocation(ProgramNormals, "view"), 1, GL_FALSE, glm::value_ptr(view));
        glUniformMatrix4fv(glGetUniformLocation(ProgramNormals, "proj"), 1, GL_FALSE, glm::value_ptr(proj));

        glUniform3fv(glGetUniformLocation(ProgramNormals, "cameraPos"), 1, glm::value_ptr(cameraPos));
        glUniform1f(glGetUniformLocation(ProgramNormals, "maxTessLevel"), 32.0f);

        glActiveTexture(GL_TEXTURE0);
        glBindTexture(GL_TEXTURE_2D, heightMapTexture);
        glUniform1i(glGetUniformLocation(ProgramNormals, "heightMap"), 0);

        glBindVertexArray(VAO);
        glDrawElements(GL_PATCHES, 6, GL_UNSIGNED_INT, 0);

        glBindVertexArray(0);
        glUseProgram(0);

        glLineWidth(1.0f);
    }

    checkOpenGLerror();
}

void Release() {
    glDeleteProgram(Program);
    glDeleteVertexArrays(1, &VAO);
    glDeleteBuffers(1, &VBO);
    glDeleteBuffers(1, &EBO);
    glDeleteTextures(1, &heightMapTexture);
}

int main() {
    sf::Window window(sf::VideoMode({ 800, 600 }), "Tessellation Landscape");
    window.setVerticalSyncEnabled(true);
    window.setActive(true);

    glewInit();
    Init();

    while (window.isOpen()) {
        while (const std::optional event = window.pollEvent()) {
            if (event->is<sf::Event::Closed>()) {
                window.close();
                break;
            }
            if (event->is<sf::Event::MouseMoved>()) {
                MouseCallback(window);
            }
            if (event->is<sf::Event::Resized>()) {
                sf::Vector2u size = window.getSize();
                glViewport(0, 0, size.x, size.y);
            }
            if (event->is<sf::Event::MouseButtonPressed>()) {
                auto mouseEvent = event->getIf<sf::Event::MouseButtonPressed>();
                if (mouseEvent && mouseEvent->button == sf::Mouse::Button::Left) {
                    isMousePressed = true;
                    firstMouse = true;
                    lastMousePos = sf::Mouse::getPosition(window);
                }
            }
            if (event->is<sf::Event::MouseButtonReleased>()) {
                auto mouseEvent = event->getIf<sf::Event::MouseButtonReleased>();
                if (mouseEvent && mouseEvent->button == sf::Mouse::Button::Left) {
                    isMousePressed = false;
                }
            }
            if (event->is<sf::Event::KeyPressed>()) {
                auto keyEvent = event->getIf<sf::Event::KeyPressed>();
                if (keyEvent && keyEvent->code == sf::Keyboard::Key::N) {
                    showNormals = !showNormals;
                }
            }
        }

        if (!window.isOpen()) continue;

        HandleInput(window);

        glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
        glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

        Draw();

        window.display();
    }

    Release();
    return 0;
}