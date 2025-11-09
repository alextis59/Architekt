# Architekt

## Project description 

Architekt will be a web app designed for easy High level designs create with the goal of helping engineers and developers iterate easily and quickly on their implementations and architectures.
It will offer tools for the user to easily define architectures/systems and to create flows and scenarios that will represent their implementations.

## Features 

### Project management 

The user will be able to create projects and select on which one he is currently working.

### Architecture design

The app will offer a tool to easily design simple and complex architectures/systems and visualize them.
A system can contain other systems and/or components.
Components can be defined as systems without childs if we want to have a unified and flexible data model.
System/components will then be represented by:
- name
- description 
- tags (js, lambda, pod, etc...)
- childs

The user need to be able to easily fill his architecture and visualize it with different visual format (tree, graphs, tag filters, etc...).

When creating a project, a root system will be created for the project (with same name as the project) which will be the starting point for other systems of this project (this root system cannot be deleted).

### Flow design

The app will offer a tool to easily design simple and complex flows/scenarios and visualize them.

A flow will be represented by the systems used and the steps inside it.
When creating/editing a flow, the user will be able to select which part of the project systems will be used for it (thus hiding the others in the flow editing/visualization tools).

Each step will have systems as source (entry point) and target (exit point), which can be the same for a step representing an action done inside a system.

A flow will be represented by:
- name
- description 
- tags
- steps

A step will be represented by:
- name 
- description 
- source
- target
- tags

The user need to be able to easily fill his flows and visualize them with different visual format (linear, graphs, complete, sequential playing, tag filters, etc...).

The user should also be able to create alternate flows which starts from an existing step of a flow.

## Technologies 

- nodeJS
- express 
- React

## Requirements 

First version of the app need to be launchable locally with a command while storing data on file system. 
But data model handling need to be flexible so that a future could be hosted on the cloud with mongodb as database (first version should be able to run without mongodb or a kind of mocked mongodb relying only on filesystem).

## Guidances

Look for a powerful, dynamic and easy to use library for graphs, trees display (and similar). The lib used should be able to handle the displays dynamically and autonomously.
